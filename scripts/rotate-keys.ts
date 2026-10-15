/**
 * Ré-chiffre les données avec la clé courante après une rotation de clé.
 *   npm run keys:reencrypt -- --dry-run   (compte sans écrire)
 *   npm run keys:reencrypt
 * Prérequis : DATA_ENCRYPTION_KEY (nouvelle), DATA_ENCRYPTION_KEY_ID (nouvel identifiant),
 * DATA_ENCRYPTION_KEYS_PREVIOUS (anciennes clés). Faire une sauvegarde de la base avant.
 */
import { PrismaClient } from "@prisma/client";
import { reencryptAll } from "../src/lib/security/rotation";

const db = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");
const currentKeyId = process.env.DATA_ENCRYPTION_KEY_ID || "v1";

reencryptAll(db, { currentKeyId, dryRun })
  .then((report) => {
    console.log(`${dryRun ? "[simulation] " : ""}Ré-chiffrement vers la clé "${currentKeyId}" :`);
    for (const [model, r] of Object.entries(report)) console.log(`  ${model} : ${r.reencrypted} / ${r.scanned} enregistrement(s)`);
    if (!dryRun) console.log("Terminé. L'ancienne clé peut être retirée de DATA_ENCRYPTION_KEYS_PREVIOUS après vérification et sauvegarde.");
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "Erreur inconnue");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
