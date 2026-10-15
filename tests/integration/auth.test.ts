import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { authenticate, createInvitation, acceptInvitation, MAX_FAILED_LOGINS, requestPasswordReset, resetPassword } from "@/lib/services/auth-service";
import { createSessionRecord, resolveSessionToken } from "@/lib/auth/session";
import { generateToken, hashToken } from "@/lib/security/crypto";
import { makeOrg, makeUser, PASSWORD } from "../support/factory";

const meta = { ip: "203.0.113.7" };

describe("authentification", () => {
  it("connecte avec le bon mot de passe et refuse un mauvais, avec message générique", async () => {
    const org = await makeOrg();
    const u = await makeUser(org.id, ["PROFESSIONAL"]);
    await expect(authenticate(u.email, PASSWORD, meta)).resolves.toMatchObject({ id: u.id });
    await expect(authenticate(u.email, "mauvais", meta)).rejects.toThrow("Adresse e-mail ou mot de passe incorrect.");
    await expect(authenticate("inconnu@test.local", "x", meta)).rejects.toThrow("Adresse e-mail ou mot de passe incorrect.");
  });

  it("verrouille le compte après plusieurs échecs", async () => {
    const org = await makeOrg();
    const u = await makeUser(org.id, ["PROFESSIONAL"]);
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await authenticate(u.email, "mauvais", { ip: `198.51.100.${i}` }).catch(() => undefined);
    await expect(authenticate(u.email, PASSWORD, meta)).rejects.toThrow(/verrouillé/);
  });

  it("refuse un compte désactivé et invalide ses sessions", async () => {
    const org = await makeOrg();
    const u = await makeUser(org.id, ["PROFESSIONAL"]);
    const { token } = await createSessionRecord(u.id);
    expect(await resolveSessionToken(token)).not.toBeNull();
    await db.user.update({ where: { id: u.id }, data: { isActive: false } });
    expect(await resolveSessionToken(token)).toBeNull();
    await expect(authenticate(u.email, PASSWORD, meta)).rejects.toThrow(/désactivé/);
  });

  it("expire les sessions inactives", async () => {
    const org = await makeOrg();
    const u = await makeUser(org.id, ["PROFESSIONAL"]);
    const { token } = await createSessionRecord(u.id);
    await db.session.update({ where: { tokenHash: hashToken(token) }, data: { lastSeenAt: new Date(Date.now() - 3 * 3600_000) } });
    expect(await resolveSessionToken(token)).toBeNull();
  });

  it("réinitialise le mot de passe et ferme toutes les sessions", async () => {
    const org = await makeOrg();
    const u = await makeUser(org.id, ["PROFESSIONAL"]);
    const { token: session } = await createSessionRecord(u.id);
    await requestPasswordReset(u.email, { ip: "192.0.2.1" }, "http://localhost:3000");
    const rt = await db.passwordResetToken.findFirstOrThrow({ where: { userId: u.id } });
    // le jeton en clair n'est jamais stocké : on en remplace l'empreinte par un jeton connu
    const known = generateToken();
    await db.passwordResetToken.update({ where: { id: rt.id }, data: { tokenHash: hashToken(known) } });
    await expect(resetPassword(known, "court", meta)).rejects.toMatchObject({ code: "VALIDATION" });
    await resetPassword(known, "Nouveau-Secret-2026!", meta);
    expect(await resolveSessionToken(session)).toBeNull();
    await expect(resetPassword(known, "Nouveau-Secret-2026!", meta)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(authenticate(u.email, "Nouveau-Secret-2026!", meta)).resolves.toBeTruthy();
  });

  it("inscrit un utilisateur par invitation", async () => {
    const org = await makeOrg();
    const admin = await makeUser(org.id, ["ORG_ADMIN"]);
    const { link } = await createInvitation({ id: admin.id, organizationId: org.id }, { email: "nouvelle@test.local", fullName: "Nouvelle Personne", roles: ["PROFESSIONAL"] }, "http://x", meta);
    const token = link.split("/").pop()!;
    const user = await acceptInvitation(token, "Bienvenue-Equipe-2026!", meta);
    expect(user.organizationId).toBe(org.id);
    expect(user.roles).toEqual(["PROFESSIONAL"]);
    await expect(acceptInvitation(token, "Bienvenue-Equipe-2026!", meta)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
