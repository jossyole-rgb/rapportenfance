/**
 * Commandes d'administration de production (à exécuter sur le serveur, par une personne habilitée).
 *
 *   npm run admin -- create-tech-admin --email prenom.nom@exemple.fr --name "Prénom Nom"
 *       Crée le premier administrateur technique (amorçage). Aucun mot de passe n'est saisi en ligne de commande :
 *       un lien de définition du mot de passe, valable 60 minutes, est affiché.
 *   npm run admin -- reset-mfa --email prenom.nom@exemple.fr
 *       Réinitialise la double authentification (dernier administrateur ayant perdu son téléphone).
 *   npm run admin -- unlock --email prenom.nom@exemple.fr
 *       Lève un verrouillage temporaire après échecs de connexion.
 *
 * Chaque commande est tracée dans le journal d'audit.
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { generateToken, hashToken } from "../src/lib/security/crypto";
import { hashPassword } from "../src/lib/security/password";

const db = new PrismaClient();
const [command, ...rest] = process.argv.slice(2);

function arg(name: string): string {
  const i = rest.indexOf(`--${name}`);
  const v = i >= 0 ? rest[i + 1] : undefined;
  if (!v || v.startsWith("--")) throw new Error(`Paramètre --${name} manquant.`);
  return v.trim();
}

const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

async function findUser(email: string) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw new Error(`Aucun compte pour ${email}.`);
  return user;
}

async function createTechAdmin() {
  const email = arg("email").toLowerCase();
  const name = arg("name");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Adresse e-mail invalide.");
  if (await db.user.findUnique({ where: { email } })) throw new Error("Un compte existe déjà avec cette adresse.");
  // Mot de passe aléatoire jamais communiqué : la personne définit le sien via le lien
  const user = await db.user.create({
    data: { email, fullName: name, roles: ["TECH_ADMIN"], passwordHash: await hashPassword(randomBytes(32).toString("base64")) },
  });
  const token = generateToken();
  await db.passwordResetToken.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + 60 * 60_000) } });
  await db.auditLog.create({ data: { action: "user.invited", actorEmail: "cli", resourceType: "user", resourceId: user.id, metadata: { roles: "TECH_ADMIN", via: "cli" } } });
  console.log(`Administrateur technique créé : ${email}`);
  console.log(`Lien de définition du mot de passe (60 min, usage unique) :\n${appUrl()}/reinitialiser/${token}`);
  console.log("La double authentification lui sera demandée à la première connexion (sauf PLATFORM_MFA_REQUIRED=false).");
}

async function resetMfa() {
  const user = await findUser(arg("email"));
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null, recoveryCodeHashes: [] } }),
    db.session.deleteMany({ where: { userId: user.id } }),
    db.mfaChallenge.deleteMany({ where: { userId: user.id } }),
    db.auditLog.create({ data: { action: "auth.mfa_reset", organizationId: user.organizationId, actorEmail: "cli", resourceType: "user", resourceId: user.id, metadata: { via: "cli" } } }),
  ]);
  console.log(`Double authentification réinitialisée pour ${user.email}. Sessions fermées.`);
}

async function unlock() {
  const user = await findUser(arg("email"));
  await db.user.update({ where: { id: user.id }, data: { lockedUntil: null, failedLoginCount: 0 } });
  await db.auditLog.create({ data: { action: "user.updated", organizationId: user.organizationId, actorEmail: "cli", resourceType: "user", resourceId: user.id, metadata: { via: "cli", unlocked: true } } });
  console.log(`Compte déverrouillé : ${user.email}.`);
}

const commands: Record<string, () => Promise<void>> = { "create-tech-admin": createTechAdmin, "reset-mfa": resetMfa, unlock };

const run = command ? commands[command] : undefined;
if (!run) {
  console.error(`Commande inconnue. Disponibles : ${Object.keys(commands).join(", ")}. Voir l'en-tête de scripts/admin.ts.`);
  process.exitCode = 1;
} else {
  run()
    .catch((e) => {
      console.error(e instanceof Error ? e.message : "Erreur inconnue");
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
