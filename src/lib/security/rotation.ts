import type { PrismaClient } from "@prisma/client";
import { decrypt, encrypt } from "./crypto";

/**
 * Ré-chiffrement avec la clé courante de toutes les valeurs chiffrées par une clé précédente.
 * À lancer après une rotation (DATA_ENCRYPTION_KEY = nouvelle clé, DATA_ENCRYPTION_KEYS_PREVIOUS = anciennes),
 * avant de retirer définitivement l'ancienne clé de la configuration.
 * Le contenu en clair n'est jamais écrit ailleurs qu'en mémoire ; le contenu des versions est inchangé (seul le chiffré change).
 */

const FIELDS = {
  document: ["notesEnc", "purposeEnc", "attendeesEnc", "meetingLocationEnc"],
  documentVersion: ["contentEnc", "analysisEnc"],
  caseFile: ["childAliasEnc"],
  user: ["totpSecretEnc"],
} as const;

type Model = keyof typeof FIELDS;
export type RotationReport = Record<Model, { scanned: number; reencrypted: number }>;

const keyIdOf = (payload: string) => payload.split(":", 1)[0];

export async function reencryptAll(db: PrismaClient, opts: { currentKeyId: string; dryRun?: boolean; batchSize?: number }): Promise<RotationReport> {
  const batchSize = opts.batchSize ?? 200;
  const report = {} as RotationReport;
  for (const model of Object.keys(FIELDS) as Model[]) {
    const fields = FIELDS[model];
    report[model] = { scanned: 0, reencrypted: 0 };
    // accès générique aux délégués Prisma (mêmes méthodes findMany / update pour chaque modèle)
    const delegate = db[model] as unknown as {
      findMany(args: unknown): Promise<Array<Record<string, string | null>>>;
      update(args: unknown): Promise<unknown>;
    };
    let cursor: string | undefined;
    for (;;) {
      const rows = await delegate.findMany({
        take: batchSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
        select: Object.fromEntries([["id", true], ...fields.map((f) => [f, true])]),
      });
      if (!rows.length) break;
      for (const row of rows) {
        report[model].scanned++;
        const data: Record<string, string> = {};
        for (const f of fields) {
          const v = row[f];
          if (v && keyIdOf(v) !== opts.currentKeyId) data[f] = encrypt(decrypt(v));
        }
        if (Object.keys(data).length) {
          report[model].reencrypted++;
          if (!opts.dryRun) await delegate.update({ where: { id: row.id }, data });
        }
      }
      cursor = rows[rows.length - 1]!.id!;
    }
  }
  return report;
}
