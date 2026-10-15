import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCaseFile } from "@/lib/services/case-files";
import { createDocument, getDocumentWorkspace } from "@/lib/services/documents";
import { reencryptAll } from "@/lib/security/rotation";
import { resetKeyRingForTests } from "@/lib/security/crypto";
import { purgeTechnicalRecords } from "@/lib/retention";
import { createSessionRecord } from "@/lib/auth/session";
import { docInput, makeOrg, makeUser } from "../support/factory";

const saved = {
  key: process.env.DATA_ENCRYPTION_KEY,
  id: process.env.DATA_ENCRYPTION_KEY_ID,
  previous: process.env.DATA_ENCRYPTION_KEYS_PREVIOUS,
};
function useKeys(key: string, id: string, previous = "") {
  process.env.DATA_ENCRYPTION_KEY = key;
  process.env.DATA_ENCRYPTION_KEY_ID = id;
  process.env.DATA_ENCRYPTION_KEYS_PREVIOUS = previous;
  resetKeyRingForTests();
}
afterAll(() => {
  process.env.DATA_ENCRYPTION_KEY = saved.key;
  process.env.DATA_ENCRYPTION_KEY_ID = saved.id;
  process.env.DATA_ENCRYPTION_KEYS_PREVIOUS = saved.previous;
  resetKeyRingForTests();
});

describe("rotation de la clé de chiffrement", () => {
  it("ré-chiffre toutes les données avec la nouvelle clé, qui suffit ensuite seule", async () => {
    const oldKey = randomBytes(32).toString("base64");
    const newKey = randomBytes(32).toString("base64");
    useKeys(oldKey, "k1");
    const org = await makeOrg();
    const pro = await makeUser(org.id, ["PROFESSIONAL"]);
    const cf = await createCaseFile(pro, { reference: "ROT-1", childAlias: "Lucas" });
    const doc = await createDocument(pro, docInput(cf.id));

    useKeys(newKey, "k2", `k1:${oldKey}`);
    const dry = await reencryptAll(db, { currentKeyId: "k2", dryRun: true });
    expect(dry.document.reencrypted).toBeGreaterThanOrEqual(1);
    expect((await db.document.findUniqueOrThrow({ where: { id: doc.id } })).notesEnc.startsWith("k1:")).toBe(true);

    const report = await reencryptAll(db, { currentKeyId: "k2", batchSize: 2 });
    expect(report.document.reencrypted).toBe(dry.document.reencrypted);
    const row = await db.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(row.notesEnc.startsWith("k2:")).toBe(true);
    expect((await db.caseFile.findUniqueOrThrow({ where: { id: cf.id } })).childAliasEnc?.startsWith("k2:")).toBe(true);

    // l'ancienne clé retirée : tout reste lisible
    useKeys(newKey, "k2");
    const ws = await getDocumentWorkspace(pro, doc.id);
    expect(ws.input.notes).toContain("Visite domicile mère");
    // second passage : plus rien à faire
    expect((await reencryptAll(db, { currentKeyId: "k2" })).document.reencrypted).toBe(0);
  });
});

describe("nettoyage technique", () => {
  it("supprime sessions, vérifications et compteurs expirés, sans toucher aux données actives", async () => {
    const org = await makeOrg();
    const u = await makeUser(org.id, ["PROFESSIONAL"]);
    const active = await createSessionRecord(u.id);
    const expired = await createSessionRecord(u.id);
    const rows = await db.session.findMany({ where: { userId: u.id }, orderBy: { createdAt: "asc" } });
    await db.session.update({ where: { id: rows[1]!.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await db.rateLimitBucket.create({ data: { key: "old", count: 3, windowStart: new Date(Date.now() - 2 * 86400_000) } });
    await db.rateLimitBucket.create({ data: { key: "recent", count: 1, windowStart: new Date() } });
    expect(await purgeTechnicalRecords(db)).toBeGreaterThanOrEqual(2);
    expect(await db.session.count({ where: { userId: u.id } })).toBe(1);
    expect(await db.rateLimitBucket.findUnique({ where: { key: "recent" } })).not.toBeNull();
    expect(await db.rateLimitBucket.findUnique({ where: { key: "old" } })).toBeNull();
    expect(active.token).not.toBe(expired.token);
  });
});
