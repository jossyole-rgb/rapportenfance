import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { authenticate, LOGIN_FAILURES_PER_IP, MAX_FAILED_LOGINS } from "@/lib/services/auth-service";
import {
  adminResetMfa,
  confirmMfaEnrollment,
  createMfaChallenge,
  disableMfa,
  getMfaStatus,
  MAX_MFA_ATTEMPTS,
  startMfaEnrollment,
  verifyMfaChallenge,
} from "@/lib/services/mfa-service";
import { createSessionRecord, resolveSessionToken } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { currentStep, totpAt } from "@/lib/security/totp";
import { makeOrg, makeUser, PASSWORD } from "../support/factory";

const meta = { ip: "203.0.113.50" };
const code = (secret: string, offset = 0) => totpAt(secret, currentStep() + offset);

async function enrolledUser() {
  const org = await makeOrg();
  const u = await makeUser(org.id, ["PROFESSIONAL"]);
  const { secret } = await startMfaEnrollment(u.id);
  const recovery = await confirmMfaEnrollment(u.id, code(secret, -1), meta);
  return { org, u, secret, recovery };
}

describe("double authentification", () => {
  it("active la double authentification : secret chiffré en base, codes de secours hachés", async () => {
    const org = await makeOrg();
    const u = await makeUser(org.id, ["PROFESSIONAL"]);
    expect((await getMfaStatus(u.id)).required).toBe(true);
    const { secret } = await startMfaEnrollment(u.id);
    // le secret en attente est stable entre deux affichages
    expect((await startMfaEnrollment(u.id)).secret).toBe(secret);
    await expect(confirmMfaEnrollment(u.id, "000000", meta)).rejects.toMatchObject({ code: "VALIDATION" });
    const codes = await confirmMfaEnrollment(u.id, code(secret), meta);
    expect(codes).toHaveLength(8);
    const row = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.totpSecretEnc).not.toContain(secret);
    expect(row.recoveryCodeHashes.join()).not.toContain(codes[0]!.replace("-", ""));
    expect(row.totpEnabledAt).not.toBeNull();
    const log = await db.auditLog.findFirstOrThrow({ where: { actorId: u.id, action: "auth.mfa_enabled" } });
    expect(JSON.stringify(log)).not.toContain(secret);
  });

  it("le mot de passe seul n'ouvre pas de session quand la double authentification est active", async () => {
    const { u, secret } = await enrolledUser();
    await authenticate(u.email, PASSWORD, meta);
    // la connexion n'est pas journalisée tant que le second facteur n'est pas vérifié
    expect(await db.auditLog.count({ where: { actorId: u.id, action: "auth.login" } })).toBe(0);
    const { token } = await createMfaChallenge(u.id, "/ecrits");
    await expect(verifyMfaChallenge(token, "000000", meta)).rejects.toThrow(/incorrect/);
    const ok = await verifyMfaChallenge(token, code(secret), meta);
    expect(ok).toMatchObject({ method: "totp", nextPath: "/ecrits" });
    expect(await db.auditLog.count({ where: { actorId: u.id, action: "auth.login" } })).toBe(1);
    // la vérification est à usage unique
    await expect(verifyMfaChallenge(token, code(secret), meta)).rejects.toThrow(/expiré/);
  });

  it("refuse le rejeu d'un code déjà utilisé", async () => {
    const { u, secret } = await enrolledUser();
    const c = code(secret);
    const first = await createMfaChallenge(u.id);
    await verifyMfaChallenge(first.token, c, meta);
    const second = await createMfaChallenge(u.id);
    await expect(verifyMfaChallenge(second.token, c, meta)).rejects.toThrow(/incorrect/);
  });

  it("accepte un code de secours une seule fois", async () => {
    const { u, recovery } = await enrolledUser();
    const c1 = await createMfaChallenge(u.id);
    const res = await verifyMfaChallenge(c1.token, recovery[0]!.toLowerCase(), meta);
    expect(res).toMatchObject({ method: "recovery", remainingRecoveryCodes: 7 });
    const c2 = await createMfaChallenge(u.id);
    await expect(verifyMfaChallenge(c2.token, recovery[0]!, meta)).rejects.toThrow(/incorrect/);
    expect(await db.auditLog.count({ where: { actorId: u.id, action: "auth.recovery_code_used" } })).toBe(1);
  });

  it("invalide la vérification après trop d'essais et verrouille le compte", async () => {
    const { u, secret } = await enrolledUser();
    const { token } = await createMfaChallenge(u.id);
    for (let i = 0; i < MAX_MFA_ATTEMPTS - 1; i++) await expect(verifyMfaChallenge(token, "111111", meta)).rejects.toThrow();
    await expect(verifyMfaChallenge(token, "111111", meta)).rejects.toThrow(/Trop de codes/);
    await expect(verifyMfaChallenge(token, code(secret), meta)).rejects.toThrow(/expiré/);
    expect(MAX_MFA_ATTEMPTS).toBeLessThanOrEqual(MAX_FAILED_LOGINS);
    const row = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.lockedUntil && row.lockedUntil > new Date()).toBe(true);
    await expect(authenticate(u.email, PASSWORD, meta)).rejects.toThrow(/verrouillé/);
  });

  it("désactivation : mot de passe et code exigés", async () => {
    const { u, secret } = await enrolledUser();
    await expect(disableMfa(u.id, "mauvais", code(secret), meta)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(disableMfa(u.id, PASSWORD, "000000", meta)).rejects.toMatchObject({ code: "VALIDATION" });
    await disableMfa(u.id, PASSWORD, code(secret, 1), meta);
    expect((await getMfaStatus(u.id)).enabled).toBe(false);
  });

  it("réinitialisation par l'administrateur de l'établissement uniquement, sessions fermées", async () => {
    const { org, u } = await enrolledUser();
    const admin = await makeUser(org.id, ["ORG_ADMIN"]);
    const other = await makeUser((await makeOrg()).id, ["ORG_ADMIN"]);
    const pro = await makeUser(org.id, ["PROFESSIONAL"]);
    const { token } = await createSessionRecord(u.id);
    await expect(adminResetMfa(pro, u.id, meta)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(adminResetMfa(other, u.id, meta)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(adminResetMfa(admin, admin.id, meta)).rejects.toMatchObject({ code: "CONFLICT" });
    await adminResetMfa(admin, u.id, meta);
    expect((await getMfaStatus(u.id)).enabled).toBe(false);
    expect(await resolveSessionToken(token)).toBeNull();
  });
});

describe("limitation de débit partagée", () => {
  it("compte en base et bloque au-delà du seuil", async () => {
    const key = `test:${Date.now()}`;
    for (let i = 0; i < 3; i++) expect((await rateLimit(key, 3, 60_000)).allowed).toBe(true);
    const blocked = await rateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    // fenêtre expirée : le compteur repart
    await db.rateLimitBucket.update({ where: { key }, data: { windowStart: new Date(Date.now() - 120_000) } });
    expect((await rateLimit(key, 3, 60_000)).allowed).toBe(true);
  });

  it("reste exact sous requêtes concurrentes", async () => {
    const key = `concurrent:${Date.now()}`;
    const results = await Promise.all(Array.from({ length: 20 }, () => rateLimit(key, 10, 60_000)));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
  });

  it("ne compte que les échecs par adresse IP : une équipe derrière la même adresse n'est pas bloquée", async () => {
    const org = await makeOrg();
    const u = await makeUser(org.id, ["PROFESSIONAL"]);
    const shared = { ip: "198.51.100.200" };
    for (let i = 0; i < LOGIN_FAILURES_PER_IP + 5; i++) await authenticate(u.email, PASSWORD, shared);
    for (let i = 0; i < LOGIN_FAILURES_PER_IP; i++) await authenticate(`inconnu${i}@test.local`, "x", shared).catch(() => undefined);
    await expect(authenticate(u.email, PASSWORD, shared)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
