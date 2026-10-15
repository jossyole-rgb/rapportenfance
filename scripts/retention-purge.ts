/**
 * Purge des documents archivés dont la durée de conservation (paramètre de l'établissement) est échue.
 * À planifier quotidiennement (cron ou tâche planifiée de l'hébergeur) : npm run retention:purge
 */
import { PrismaClient } from "@prisma/client";
import { purgeExpiredDocuments, purgeTechnicalRecords } from "../src/lib/retention";

const db = new PrismaClient();

purgeExpiredDocuments(db)
  .then(async (n) => {
    console.log(`Purge de conservation terminée : ${n} document(s) supprimé(s).`);
    console.log(`Nettoyage technique : ${await purgeTechnicalRecords(db)} enregistrement(s) expiré(s) supprimé(s).`);
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
