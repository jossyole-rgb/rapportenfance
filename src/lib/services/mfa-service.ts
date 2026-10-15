import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, forbidden, invalid, notFound } from "@/lib/errors";
import { decrypt, encrypt, generateToken, hashToken } from "@/lib/security/crypto";
import { verifyPassword } from "@/lib/security/password";
import { generateRecoveryCodes, generateTotpSecret, normalizeRecoveryCode, verifyTotp } from "@/lib/security/totp";
import { isRateLimited } from "@/lib/rate-limit";
import { canManageUsers, type Actor } from "@/lib/auth/permissions";
import { isMfaRequired } from "@/lib/auth/mfa-policy";
import { completeLogin, LOGIN_FAILURES_PER_IP, recordFailedAttempt, type RequestMeta } from "./auth-service";

export const MFA_CHALLENGE_MINUTES = 5;
export const MAX_MFA_ATTEMPTS = 5;

const GENERIC_MFA_ERROR = "Code incorrect ou expiré.";
const EXPIRED_CHALLENGE = "La vérification a expiré. Reconnectez-vous.";

// ---------------------------------------------------------------------------------------------
// Connexion : étape du second facteur
// ---------------------------------------------------------------------------------------------

/** Ouvre une vérification de second facteur après un mot de passe correct. Retourne le jeton (seule son empreinte est stockée). */
export async function createMfaChallenge(userId: string, nextPath?: string | null): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + MFA_CHALLENGE_MINUTES * 60_000);
  await db.mfaChallenge.deleteMany({ where: { OR: [{ userId }, { expiresAt: { lt: new Date() } }] } });
  await db.mfaChallenge.create({ data: { tokenHash: hashToken(token), userId, expiresAt, nextPath: nextPath?.slice(0, 300) || null } });
  return { token, expiresAt };
}

export async function getMfaChallenge(token: string | undefined | null) {
  if (!token || token.length > 100) return null;
  const ch = await db.mfaChallenge.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!ch || ch.expiresAt < new Date()) return null;
  return ch;
}

/**
 * Vérifie le code (application d'authentification ou code de secours) et termine la connexion.
 * Chaque échec compte dans le verrouillage du compte, comme un mauvais mot de passe.
 */
export async function verifyMfaChallenge(token: string, codeInput: string, meta: RequestMeta) {
  if (await isRateLimited(`login-fail-ip:${meta.ip}`, LOGIN_FAILURES_PER_IP, 15 * 60_000)) {
    throw new AppError("RATE_LIMITED", "Trop de tentatives. Réessayez dans quelques minutes.");
  }

  const ch = await getMfaChallenge(token);
  if (!ch) throw new AppError("UNAUTHENTICATED", EXPIRED_CHALLENGE);
  const user = await db.user.findUniqueOrThrow({ where: { id: ch.userId }, include: { organization: true } });
  if (!user.isActive || (user.organization && !user.organization.isActive) || (user.lockedUntil && user.lockedUntil > new Date()) || !user.totpSecretEnc || !user.totpEnabledAt) {
    await db.mfaChallenge.delete({ where: { id: ch.id } }).catch(() => undefined);
    throw new AppError("UNAUTHENTICATED", EXPIRED_CHALLENGE);
  }

  const code = codeInput.trim().slice(0, 40);
  let method: "totp" | "recovery" | null = null;

  const step = verifyTotp(decrypt(user.totpSecretEnc), code, user.totpLastStep);
  if (step !== null) {
    // Mise à jour conditionnelle : deux requêtes simultanées avec le même code ne peuvent pas réussir toutes les deux
    const res = await db.user.updateMany({
      where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    if (res.count === 1) method = "totp";
  } else {
    const hash = hashToken(normalizeRecoveryCode(code));
    if (normalizeRecoveryCode(code).length === 10 && user.recoveryCodeHashes.includes(hash)) {
      const res = await db.user.updateMany({
        where: { id: user.id, recoveryCodeHashes: { has: hash } },
        data: { recoveryCodeHashes: user.recoveryCodeHashes.filter((h) => h !== hash) },
      });
      if (res.count === 1) method = "recovery";
    }
  }

  if (!method) {
    const attempts = ch.attempts + 1;
    if (attempts >= MAX_MFA_ATTEMPTS) await db.mfaChallenge.delete({ where: { id: ch.id } }).catch(() => undefined);
    else await db.mfaChallenge.update({ where: { id: ch.id }, data: { attempts } });
    const locked = await recordFailedAttempt(user, meta, "bad_mfa_code");
    if (locked || attempts >= MAX_MFA_ATTEMPTS) throw new AppError("UNAUTHENTICATED", "Trop de codes incorrects. Reconnectez-vous plus tard.");
    throw new AppError("UNAUTHENTICATED", GENERIC_MFA_ERROR);
  }

  await db.mfaChallenge.delete({ where: { id: ch.id } });
  if (method === "recovery") {
    await audit({
      action: "auth.recovery_code_used",
      organizationId: user.organizationId,
      actorId: user.id,
      ipAddress: meta.ip,
      metadata: { remaining: user.recoveryCodeHashes.length - 1 },
    });
  }
  await completeLogin(user.id, user.organizationId, meta, { mfa: method });
  return { user, nextPath: ch.nextPath, method, remainingRecoveryCodes: user.recoveryCodeHashes.length - (method === "recovery" ? 1 : 0) };
}

// ---------------------------------------------------------------------------------------------
// Activation, codes de secours, désactivation
// ---------------------------------------------------------------------------------------------

/** Prépare l'activation : génère un secret (chiffré en base) que l'utilisateur ajoute à son application. */
export async function startMfaEnrollment(userId: string): Promise<{ secret: string }> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.totpEnabledAt) throw new AppError("CONFLICT", "La double authentification est déjà active.");
  // Un secret en attente est réutilisé, pour que le QR code reste stable entre deux affichages
  if (user.totpSecretEnc) return { secret: decrypt(user.totpSecretEnc) };
  const secret = generateTotpSecret();
  await db.user.update({ where: { id: userId }, data: { totpSecretEnc: encrypt(secret), totpLastStep: null } });
  return { secret };
}

/** Confirme l'activation avec un premier code ; retourne les codes de secours (affichés une seule fois). */
export async function confirmMfaEnrollment(userId: string, code: string, meta: RequestMeta): Promise<string[]> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.totpEnabledAt) throw new AppError("CONFLICT", "La double authentification est déjà active.");
  if (!user.totpSecretEnc) throw invalid("Recommencez l'activation.");
  const step = verifyTotp(decrypt(user.totpSecretEnc), code, null);
  if (step === null) throw invalid("Code incorrect. Vérifiez l'heure de votre téléphone et saisissez le code affiché.", { code: "Code incorrect." });
  const codes = generateRecoveryCodes();
  await db.user.update({
    where: { id: userId },
    data: { totpEnabledAt: new Date(), totpLastStep: step, recoveryCodeHashes: codes.map((c) => hashToken(normalizeRecoveryCode(c))) },
  });
  await audit({ action: "auth.mfa_enabled", organizationId: user.organizationId, actorId: userId, ipAddress: meta.ip });
  return codes;
}

async function assertSecondFactor(user: { totpSecretEnc: string | null; totpLastStep: number | null; id: string }, code: string) {
  if (!user.totpSecretEnc) throw invalid("La double authentification n'est pas active.");
  const step = verifyTotp(decrypt(user.totpSecretEnc), code, user.totpLastStep);
  if (step === null) throw invalid("Code incorrect.", { code: "Code incorrect." });
  await db.user.update({ where: { id: user.id }, data: { totpLastStep: step } });
}

export async function regenerateRecoveryCodes(userId: string, code: string, meta: RequestMeta): Promise<string[]> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpEnabledAt) throw invalid("La double authentification n'est pas active.");
  await assertSecondFactor(user, code);
  const codes = generateRecoveryCodes();
  await db.user.update({ where: { id: userId }, data: { recoveryCodeHashes: codes.map((c) => hashToken(normalizeRecoveryCode(c))) } });
  await audit({ action: "auth.recovery_codes_regenerated", organizationId: user.organizationId, actorId: userId, ipAddress: meta.ip });
  return codes;
}

/** Désactivation par l'utilisateur : mot de passe et code exigés. Si l'établissement l'impose, une nouvelle activation sera demandée. */
export async function disableMfa(userId: string, password: string, code: string, meta: RequestMeta) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.totpEnabledAt) throw invalid("La double authentification n'est pas active.");
  if (!(await verifyPassword(user.passwordHash, password))) throw invalid("Mot de passe incorrect.", { password: "Mot de passe incorrect." });
  await assertSecondFactor(user, code);
  await db.user.update({ where: { id: userId }, data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null, recoveryCodeHashes: [] } });
  await audit({ action: "auth.mfa_disabled", organizationId: user.organizationId, actorId: userId, ipAddress: meta.ip });
}

/**
 * Réinitialisation par l'administrateur de l'établissement (téléphone perdu, plus de codes de secours).
 * Les sessions de l'utilisateur sont fermées ; il devra réactiver la double authentification à sa prochaine connexion.
 */
export async function adminResetMfa(actor: Actor, userId: string, meta: RequestMeta) {
  if (!canManageUsers(actor)) throw forbidden();
  const user = await db.user.findFirst({ where: { id: userId, organizationId: actor.organizationId! } });
  if (!user) throw notFound("Utilisateur");
  if (userId === actor.id) throw new AppError("CONFLICT", "Un autre administrateur doit réinitialiser votre double authentification.");
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null, recoveryCodeHashes: [] } }),
    db.session.deleteMany({ where: { userId } }),
    db.mfaChallenge.deleteMany({ where: { userId } }),
  ]);
  await audit({ action: "auth.mfa_reset", organizationId: actor.organizationId, actorId: actor.id, resourceType: "user", resourceId: userId, ipAddress: meta.ip });
}

export async function getMfaStatus(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { organization: true } });
  return {
    enabled: !!user.totpEnabledAt,
    enabledAt: user.totpEnabledAt,
    remainingRecoveryCodes: user.recoveryCodeHashes.length,
    required: isMfaRequired(user),
  };
}
