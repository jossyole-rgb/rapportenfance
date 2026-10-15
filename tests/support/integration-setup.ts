import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll } from "vitest";

// Charge .env puis bascule sur la base de test dédiée (jamais la base de développement)
for (const line of readFileSync(path.resolve(__dirname, "../../.env"), "utf8").split("\n")) {
  const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
  if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2];
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!.replace(/\/rapportenfance\?/, "/rapportenfance_test?");
if (!process.env.DATABASE_URL.includes("_test")) throw new Error("Les tests d'intégration exigent une base dont le nom se termine par _test.");

beforeAll(async () => {
  const { db } = await import("@/lib/db");
  await db.$executeRawUnsafe(
    'TRUNCATE "AuditLog","DocumentVersion","Document","CaseFileMember","CaseFile","Invitation","PasswordResetToken","Session","MfaChallenge","RateLimitBucket","User","Organization" CASCADE',
  );
});
