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

describe("comparaison de versions", () => {
  it("compare deux versions d'un écrit, sans accès depuis un autre établissement", async () => {
    const { generateDocument, saveDocumentContent, compareDocumentVersions } = await import("@/lib/services/documents");
    const org = await makeOrg();
    const pro = await makeUser(org.id, ["PROFESSIONAL"]);
    const outsider = await makeUser((await makeOrg()).id, ["PROFESSIONAL", "VALIDATOR"]);
    const cf = await createCaseFile(pro, { reference: "CMP-1", childAlias: "Lucas" });
    const doc = await createDocument(pro, docInput(cf.id));
    await generateDocument(pro, doc.id);
    const ws = await getDocumentWorkspace(pro, doc.id);
    const sections = ws.content!.sections.map((s) => ({ key: s.key, text: s.text.replace("Logement propre.", "Le logement est propre.") }));
    await saveDocumentContent(pro, doc.id, { baseVersion: ws.currentVersion, sections });
    const cmp = await compareDocumentVersions(pro, doc.id, 1, 2);
    expect(cmp.stats.changedSections).toBe(1);
    const modified = cmp.diffs.find((d) => d.status === "modified")!;
    expect(modified.parts.filter((p) => p.type === "added").map((p) => p.text).join("")).toContain("est");
    expect((await compareDocumentVersions(pro, doc.id, 2, 2)).stats.changedSections).toBe(0);
    await expect(compareDocumentVersions(outsider, doc.id, 1, 2)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(compareDocumentVersions(pro, doc.id, 1, 9)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("conservation du journal d'audit", () => {
  it("supprime les entrées plus anciennes que la durée de l'établissement, et trace la purge", async () => {
    const { purgeExpiredAuditLogs } = await import("@/lib/retention");
    const org = await db.organization.create({ data: { name: "Org journal", slug: `org-journal-${Date.now()}`, auditRetentionDays: 180 } });
    const old = new Date(Date.now() - 200 * 86400_000);
    const recent = new Date(Date.now() - 10 * 86400_000);
    await db.auditLog.createMany({
      data: [
        { organizationId: org.id, action: "auth.login", createdAt: old },
        { organizationId: org.id, action: "document.viewed", createdAt: old },
        { organizationId: org.id, action: "auth.login", createdAt: recent },
      ],
    });
    expect(await purgeExpiredAuditLogs(db)).toBeGreaterThanOrEqual(2);
    const rows = await db.auditLog.findMany({ where: { organizationId: org.id } });
    expect(rows.map((r) => r.action).sort()).toEqual(["audit.purged", "auth.login"]);
  });
});
