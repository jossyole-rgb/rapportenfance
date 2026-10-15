import { describe, expect, it, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { createCaseFile, addCaseFileMember, listCaseFiles } from "@/lib/services/case-files";
import {
  createDocument,
  generateDocument,
  getDocumentWorkspace,
  saveDocumentContent,
  markReviewed,
  validateDocument,
  prepareExport,
  confirmClaim,
  reopenDocument,
  archiveDocument,
  deleteDocument,
  listDocuments,
} from "@/lib/services/documents";
import { MANUAL_REVIEW_ITEMS } from "@/lib/ai/completeness";
import { buildExportModel } from "@/lib/export/model";
import { renderPdf } from "@/lib/export/pdf";
import { renderDocx } from "@/lib/export/docx";
import { purgeExpiredDocuments } from "@/lib/retention";
import { docInput, makeOrg, makeUser } from "../support/factory";

const ALL = MANUAL_REVIEW_ITEMS.map((i) => i.id);

describe("isolation et contrôle d'accès", () => {
  let orgA: { id: string }, orgB: { id: string };
  let pro: Awaited<ReturnType<typeof makeUser>>, colleague: Awaited<ReturnType<typeof makeUser>>, chief: Awaited<ReturnType<typeof makeUser>>;
  let outsider: Awaited<ReturnType<typeof makeUser>>, admin: Awaited<ReturnType<typeof makeUser>>, tech: Awaited<ReturnType<typeof makeUser>>;
  let docId: string;

  beforeAll(async () => {
    orgA = await makeOrg();
    orgB = await makeOrg();
    pro = await makeUser(orgA.id, ["PROFESSIONAL"], "Pro");
    colleague = await makeUser(orgA.id, ["PROFESSIONAL"], "Collègue");
    chief = await makeUser(orgA.id, ["VALIDATOR"], "Cheffe");
    admin = await makeUser(orgA.id, ["ORG_ADMIN"], "Admin");
    outsider = await makeUser(orgB.id, ["PROFESSIONAL", "VALIDATOR"], "Externe");
    tech = await makeUser(null, ["TECH_ADMIN"], "Tech");
    const cf = await createCaseFile(pro, { reference: "T-001", childAlias: "Lucas" });
    const doc = await createDocument(pro, docInput(cf.id));
    docId = doc.id;
    await generateDocument(pro, docId);
  });

  it("chiffre les notes et le contenu en base", async () => {
    const raw = await db.document.findUniqueOrThrow({ where: { id: docId } });
    expect(raw.notesEnc).not.toContain("école");
    const v = await db.documentVersion.findFirstOrThrow({ where: { documentId: docId } });
    expect(v.contentEnc).not.toContain("Lucas");
    const cf = await db.caseFile.findFirstOrThrow({ where: { reference: "T-001" } });
    expect(cf.childAliasEnc).not.toBe("Lucas");
  });

  it("refuse l'accès depuis un autre établissement (introuvable)", async () => {
    await expect(getDocumentWorkspace(outsider, docId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(saveDocumentContent(outsider, docId, { baseVersion: 1, sections: [] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listDocuments(outsider, {})).total).toBe(0);
    expect(await listCaseFiles(outsider)).toHaveLength(0);
  });

  it("refuse l'accès à un collègue non membre du dossier, puis l'autorise une fois ajouté", async () => {
    await expect(getDocumentWorkspace(colleague, docId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const cf = await db.caseFile.findFirstOrThrow({ where: { reference: "T-001" } });
    await addCaseFileMember(pro, cf.id, colleague.id);
    const ws = await getDocumentWorkspace(colleague, docId);
    expect(ws.permissions.edit).toBe(false); // membre mais non auteur
  });

  it("interdit tout contenu métier à l'administrateur d'établissement et à l'administrateur technique", async () => {
    await expect(getDocumentWorkspace(admin, docId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getDocumentWorkspace(tech, docId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("journalise les refus d'accès sans contenu sensible", async () => {
    const logs = await db.auditLog.findMany({ where: { action: "access.denied" } });
    expect(logs.length).toBeGreaterThan(0);
    const all = JSON.stringify(await db.auditLog.findMany());
    expect(all).not.toContain("professeur");
    expect(all).not.toContain("Lucas");
  });

  it("permet au validateur de voir tous les dossiers de son établissement", async () => {
    const ws = await getDocumentWorkspace(chief, docId);
    expect(ws.permissions.edit).toBe(true);
  });
});

describe("workflow de validation humaine", () => {
  it("parcourt Brouillon -> Généré -> À vérifier -> Relu -> Validé -> Exporté -> Archivé", async () => {
    const org = await makeOrg("SUPERVISOR");
    const pro = await makeUser(org.id, ["PROFESSIONAL"]);
    const chief = await makeUser(org.id, ["VALIDATOR"]);
    const cf = await createCaseFile(pro, { reference: "W-1", childAlias: "Lucas" });
    const doc = await createDocument(pro, docInput(cf.id));
    expect(doc.status).toBe("DRAFT");

    // export définitif impossible avant validation ; export de travail impossible sans contenu
    await expect(prepareExport(pro, doc.id, "final")).rejects.toBeTruthy();
    await generateDocument(pro, doc.id);
    let ws = await getDocumentWorkspace(pro, doc.id);
    expect(ws.status).toBe("GENERATED");
    expect(ws.evaluation!.summary.red).toBe(0);
    await expect(prepareExport(pro, doc.id, "final")).rejects.toMatchObject({ code: "FORBIDDEN" });

    // ajout d'une affirmation non étayée : bloque la relecture
    const sections = ws.content!.sections.map((s) => ({
      key: s.key,
      text: s.key === "OBSERVATIONS" ? s.text + "\nLa relation mère-enfant apparaît sécurisante." : s.text.replace(/\[À compléter[^\]]*\]/g, ""),
    }));
    await saveDocumentContent(pro, doc.id, { baseVersion: ws.currentVersion, sections });
    ws = await getDocumentWorkspace(pro, doc.id);
    expect(ws.status).toBe("TO_REVIEW");
    expect(ws.currentVersion).toBe(2);
    expect(ws.evaluation!.summary.redUnacknowledged).toBe(1);
    await expect(markReviewed(pro, doc.id, ALL)).rejects.toMatchObject({ code: "VALIDATION" });

    // verrou optimiste
    await expect(saveDocumentContent(pro, doc.id, { baseVersion: 1, sections })).rejects.toMatchObject({ code: "CONFLICT" });

    // confirmation justifiée du passage
    await confirmClaim(pro, doc.id, "La relation mère-enfant apparaît sécurisante.", "Observation lors de la visite précédente du 05/10");
    ws = await getDocumentWorkspace(pro, doc.id);
    expect(ws.evaluation!.summary.redUnacknowledged).toBe(0);

    // checklist incomplète refusée
    await expect(markReviewed(pro, doc.id, ALL.slice(1))).rejects.toMatchObject({ code: "VALIDATION" });
    await markReviewed(pro, doc.id, ALL);

    // en mode SUPERVISOR, l'auteur ne peut pas valider
    await expect(validateDocument(pro, doc.id, { confirmation: true, version: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(validateDocument(chief, doc.id, { confirmation: false, version: 3 })).rejects.toMatchObject({ code: "VALIDATION" });
    await validateDocument(chief, doc.id, { confirmation: true, version: 3 });
    ws = await getDocumentWorkspace(pro, doc.id);
    expect(ws.status).toBe("VALIDATED");
    expect(ws.validator?.fullName).toBe(chief.fullName);
    expect(ws.validatedAt).toBeInstanceOf(Date);
    expect(ws.permissions.edit).toBe(false);
    await expect(saveDocumentContent(pro, doc.id, { baseVersion: 3, sections })).rejects.toMatchObject({ code: "CONFLICT" });

    // export définitif
    const { ws: exp, org: o } = await prepareExport(pro, doc.id, "final");
    const model = buildExportModel({
      mode: "final",
      org: o,
      doc: { ...exp.input, type: exp.type, status: "EXPORTED", caseReference: exp.caseReference, authorName: exp.authorName, currentVersion: exp.currentVersion, createdAt: exp.createdAt, updatedAt: exp.updatedAt, validatedAt: exp.validatedAt, validatorName: exp.validator?.fullName ?? null },
      content: exp.content!,
    });
    expect(model.draft).toBe(false);
    const pdf = await renderPdf(model);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const docx = await renderDocx(model);
    expect(docx.subarray(0, 2).toString()).toBe("PK");
    expect((await db.document.findUniqueOrThrow({ where: { id: doc.id } })).status).toBe("EXPORTED");

    // réouverture : la validation est annulée
    await reopenDocument(chief, doc.id);
    ws = await getDocumentWorkspace(pro, doc.id);
    expect(ws.status).toBe("TO_REVIEW");
    expect(ws.validatedAt).toBeNull();

    await archiveDocument(pro, doc.id);
    // l'auteur ne peut pas supprimer un document archivé ; l'administrateur oui
    await expect(deleteDocument(pro, doc.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const admin = await makeUser(org.id, ["ORG_ADMIN"]);
    await deleteDocument(admin, doc.id);
    expect(await db.document.findUnique({ where: { id: doc.id } })).toBeNull();
  });

  it("marque le brouillon exporté et interdit la validation avec passages à compléter", async () => {
    const org = await makeOrg("SELF");
    const pro = await makeUser(org.id, ["PROFESSIONAL"]);
    const cf = await createCaseFile(pro, { reference: "W-2" });
    const doc = await createDocument(pro, { ...docInput(cf.id), attendees: "", meetingLocation: "" });
    await generateDocument(pro, doc.id);
    const { ws, org: o } = await prepareExport(pro, doc.id, "draft");
    const model = buildExportModel({
      mode: "draft",
      org: o,
      doc: { ...ws.input, type: ws.type, status: ws.status, caseReference: ws.caseReference, authorName: ws.authorName, currentVersion: ws.currentVersion, createdAt: ws.createdAt, updatedAt: ws.updatedAt, validatedAt: null, validatorName: null },
      content: ws.content!,
    });
    expect(model.draft).toBe(true);
    expect(model.meta.find(([k]) => k === "Statut")![1]).toContain("BROUILLON NON VALIDÉ");
    await markReviewed(pro, doc.id, ALL);
    await expect(validateDocument(pro, doc.id, { confirmation: true, version: 1 })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("purge les documents archivés dont la durée de conservation est échue", async () => {
    const org = await makeOrg();
    await db.organization.update({ where: { id: org.id }, data: { retentionDays: 30 } });
    const pro = await makeUser(org.id, ["PROFESSIONAL"]);
    const cf = await createCaseFile(pro, { reference: "R-1" });
    const recent = await createDocument(pro, docInput(cf.id));
    const old = await createDocument(pro, docInput(cf.id));
    await archiveDocument(pro, recent.id);
    await archiveDocument(pro, old.id);
    await db.document.update({ where: { id: old.id }, data: { archivedAt: new Date(Date.now() - 31 * 86400_000) } });
    expect(await purgeExpiredDocuments(db, new Date(), org.id)).toBe(1);
    expect(await db.document.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await db.document.findUnique({ where: { id: recent.id } })).not.toBeNull();
  });
});
