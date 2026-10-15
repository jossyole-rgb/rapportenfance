import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, invalid } from "@/lib/errors";
import { checkPasswordPolicy, getDummyHash, hashPassword, verifyPassword } from "@/lib/security/password";
import { generateToken, hashToken } from "@/lib/security/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { sendMail } from "@/lib/mailer";
import type { RoleKey } from "@/lib/auth/permissions";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
const RESET_TOKEN_MINUTES = 60;
export const INVITATION_DAYS = 7;

const GENERIC_LOGIN_ERROR = "Adresse e-mail ou mot de passe incorrect.";

export type RequestMeta = { ip: string; userAgent?: string | null };

const emailSchema = z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(200);

/** Vérifie les identifiants. Messages volontairement génériques pour ne pas révéler l'existence d'un compte. */
export async function authenticate(emailInput: string, password: string, meta: RequestMeta) {
  const ipLimit = rateLimit(`login-ip:${meta.ip}`, 30, 15 * 60_000);
  if (!ipLimit.allowed) throw new AppError("RATE_LIMITED", "Trop de tentatives de connexion. Réessayez dans quelques minutes.");

  const parsed = emailSchema.safeParse(emailInput);
  if (!parsed.success || !password || password.length > 200) throw new AppError("UNAUTHENTICATED", GENERIC_LOGIN_ERROR);
  const email = parsed.data;

  const user = await db.user.findUnique({ where: { email }, include: { organization: true } });
  if (!user) {
    await verifyPassword(await getDummyHash(), password); // temps de réponse homogène
    await audit({ action: "auth.login_failed", actorEmail: email, ipAddress: meta.ip, metadata: { reason: "unknown_account" } });
    throw new AppError("UNAUTHENTICATED", GENERIC_LOGIN_ERROR);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await audit({ action: "auth.login_failed", organizationId: user.organizationId, actorId: user.id, ipAddress: meta.ip, metadata: { reason: "locked" } });
    throw new AppError("UNAUTHENTICATED", `Compte temporairement verrouillé après plusieurs échecs. Réessayez dans ${LOCK_MINUTES} minutes ou réinitialisez votre mot de passe.`);
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined },
    });
    await audit({ action: lock ? "auth.locked" : "auth.login_failed", organizationId: user.organizationId, actorId: user.id, ipAddress: meta.ip, metadata: { reason: "bad_password" } });
    throw new AppError("UNAUTHENTICATED", GENERIC_LOGIN_ERROR);
  }

  if (!user.isActive || (user.organization && !user.organization.isActive)) {
    await audit({ action: "auth.login_failed", organizationId: user.organizationId, actorId: user.id, ipAddress: meta.ip, metadata: { reason: "inactive" } });
    throw new AppError("UNAUTHENTICATED", "Ce compte est désactivé. Contactez l'administrateur de votre établissement.");
  }

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await audit({ action: "auth.login", organizationId: user.organizationId, actorId: user.id, ipAddress: meta.ip });
  return user;
}

export async function logoutSession(sessionId: string, actor: { id: string; organizationId: string | null }, meta: RequestMeta) {
  await db.session.deleteMany({ where: { id: sessionId } });
  await audit({ action: "auth.logout", organizationId: actor.organizationId, actorId: actor.id, ipAddress: meta.ip });
}

/** Demande de réinitialisation : réponse identique que le compte existe ou non. */
export async function requestPasswordReset(emailInput: string, meta: RequestMeta, appUrl: string) {
  const limit = rateLimit(`reset-ip:${meta.ip}`, 5, 15 * 60_000);
  if (!limit.allowed) throw new AppError("RATE_LIMITED", "Trop de demandes. Réessayez dans quelques minutes.");
  const parsed = emailSchema.safeParse(emailInput);
  if (!parsed.success) return;
  const user = await db.user.findUnique({ where: { email: parsed.data } });
  if (!user || !user.isActive) return;
  const token = generateToken();
  await db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  await db.passwordResetToken.create({
    data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000) },
  });
  await audit({ action: "auth.password_reset_requested", organizationId: user.organizationId, actorId: user.id, ipAddress: meta.ip });
  await sendMail({
    to: user.email,
    subject: "RapportEnfance IA - réinitialisation de votre mot de passe",
    text: `Bonjour ${user.fullName},\n\nUne réinitialisation de votre mot de passe a été demandée. Ce lien est valable ${RESET_TOKEN_MINUTES} minutes :\n${appUrl}/reinitialiser/${token}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message et prévenez votre administrateur.`,
  });
}

function assertPassword(password: string, ctx: { email?: string; fullName?: string }) {
  const problems = checkPasswordPolicy(password, ctx);
  if (problems.length) throw invalid(`Le mot de passe doit respecter : ${problems.join(" ; ")}.`, { password: problems.join(" ; ") });
}

export async function resetPassword(token: string, password: string, meta: RequestMeta) {
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.isActive) {
    throw invalid("Ce lien de réinitialisation est invalide ou a expiré. Faites une nouvelle demande.");
  }
  assertPassword(password, record.user);
  const passwordHash = await hashPassword(password);
  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.session.deleteMany({ where: { userId: record.userId } }),
  ]);
  await audit({ action: "auth.password_reset", organizationId: record.user.organizationId, actorId: record.userId, ipAddress: meta.ip });
}

export async function changePassword(userId: string, current: string, next: string, meta: RequestMeta, keepSessionId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, current))) throw invalid("Le mot de passe actuel est incorrect.", { current: "Mot de passe incorrect." });
  assertPassword(next, user);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date(Date.now() - 1000) } }),
    db.session.deleteMany({ where: { userId, NOT: { id: keepSessionId } } }),
    // la session courante est conservée : on la rajeunit pour qu'elle reste postérieure au changement
    db.session.update({ where: { id: keepSessionId }, data: { createdAt: new Date() } }),
  ]);
  await audit({ action: "auth.password_changed", organizationId: user.organizationId, actorId: userId, ipAddress: meta.ip });
}

export const invitationSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(2, "Nom requis.").max(120),
  jobTitle: z.string().trim().max(120).optional().or(z.literal("")),
  roles: z.array(z.enum(["PROFESSIONAL", "VALIDATOR", "ORG_ADMIN"])).min(1, "Choisissez au moins un rôle."),
});

/** Inscription sur invitation : l'administrateur d'établissement invite ; l'utilisateur choisit son mot de passe. */
export async function createInvitation(
  actor: { id: string; organizationId: string },
  input: z.infer<typeof invitationSchema>,
  appUrl: string,
  meta: RequestMeta,
) {
  const data = invitationSchema.parse(input);
  if (await db.user.findUnique({ where: { email: data.email } })) {
    throw invalid("Un compte existe déjà avec cette adresse e-mail.", { email: "Adresse déjà utilisée." });
  }
  const token = generateToken();
  const invitation = await db.invitation.create({
    data: {
      tokenHash: hashToken(token),
      organizationId: actor.organizationId,
      email: data.email,
      fullName: data.fullName,
      jobTitle: data.jobTitle || null,
      roles: data.roles as RoleKey[],
      invitedById: actor.id,
      expiresAt: new Date(Date.now() + INVITATION_DAYS * 86400_000),
    },
  });
  const link = `${appUrl}/invitation/${token}`;
  await audit({
    action: "user.invited",
    organizationId: actor.organizationId,
    actorId: actor.id,
    resourceType: "invitation",
    resourceId: invitation.id,
    metadata: { roles: data.roles.join(",") },
    ipAddress: meta.ip,
  });
  await sendMail({
    to: data.email,
    subject: "RapportEnfance IA - invitation",
    text: `Bonjour ${data.fullName},\n\nVous êtes invité(e) à rejoindre RapportEnfance IA. Ce lien est valable ${INVITATION_DAYS} jours :\n${link}\n`,
  });
  return { invitationId: invitation.id, link };
}

export async function getInvitation(token: string) {
  const inv = await db.invitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { organization: true } });
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date() || !inv.organization.isActive) return null;
  return inv;
}

export async function acceptInvitation(token: string, password: string, meta: RequestMeta) {
  const inv = await getInvitation(token);
  if (!inv) throw invalid("Cette invitation est invalide, a expiré ou a déjà été utilisée.");
  assertPassword(password, inv);
  if (await db.user.findUnique({ where: { email: inv.email } })) throw invalid("Un compte existe déjà avec cette adresse e-mail.");
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        organizationId: inv.organizationId,
        email: inv.email,
        fullName: inv.fullName,
        jobTitle: inv.jobTitle,
        roles: inv.roles,
        passwordHash: await hashPassword(password),
        passwordChangedAt: new Date(Date.now() - 1000),
      },
    });
    await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    await audit({ action: "auth.invitation_accepted", organizationId: inv.organizationId, actorId: created.id, ipAddress: meta.ip }, tx);
    return created;
  });
  return user;
}
