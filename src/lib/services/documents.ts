import "server-only";
import type { Document, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, forbidden, invalid, notFound } from "@/lib/errors";
import {
  canArchiveDocument,
  canDeleteDocument,
  canEditDocument,
  canExportDocument,
  canReadDocument,
  canSeeAllCaseFiles,
  canUseCaseContent,
  canValidateDocument,
  type Actor,
} from "@/lib/auth/permissions";
import { decrypt, decryptJson, decryptOptional, encrypt, encryptJson, encryptOptional } from "@/lib/security/crypto";
import { WorkflowError, canTransition, isEditable, nextStatus, type Status, type WorkflowAction } from "@/lib/domain/workflow";
import { getTemplate, type DocumentTypeKey } from "@/lib/domain/document-types";
import { documentFiltersSchema, documentInputSchema, documentUpdateSchema, fieldErrors, saveContentSchema, type DocumentFilters } from "@/lib/validation";
import { getProvider, runDraftingPipeline } from "@/lib/ai/pipeline";
import { buildSourceSegments } from "@/lib/ai/local-provider";
import { summarize, verifyReport, claimHash } from "@/lib/ai/verifier";
import { MANUAL_REVIEW_ITEMS, completenessAlerts, qualityChecks, qualityIndicator } from "@/lib/ai/completeness";
import { PLACEHOLDER_PREFIX, type Analysis, type EngineInput, type ReportContent } from "@/lib/ai/types";
import { loadCaseFile, visibleCaseFilesWhere } from "./case-files";

export const VALIDATION_CONFIRMATION =
  "Je confirme avoir relu ce document, vérifié l'exactitude des informations et effectué les modifications nécessaires avant validation.";

type DocWithCase = Document & { caseFile: { reference: string; childAliasEnc: string | null; members: { userId: string }[] } };

/** Charge un écrit en appliquant isolation d'établissement et contrôle d'accès. */
async function loadDocument(actor: Actor, id: string, need: "read" | "edit" = "read"): Promise<{ doc: DocWithCase; isMember: boolean }> {
  if (!canUseCaseContent(actor)) throw notFound("Écrit");
  const doc = await db.document.findFirst({
    where: { id, organizationId: actor.organizationId! },
    include: { caseFile: { select: { reference: true, childAliasEnc: true, members: { where: { userId: actor.id }, select: { userId: true } } } } },
  });
  if (!doc) throw notFound("Écrit");
  const isMember = doc.caseFile.members.length > 0;
  const access = { isMember };
  const allowed = need === "read" ? canReadDocument(actor, doc, access) : canEditDocument(actor, doc, access);
  if (!allowed) {
    await audit({ action: "access.denied", organizationId: actor.organizationId, actorId: actor.id, resourceType: "document", resourceId: id, metadata: { need } });
    if (!canReadDocument(actor, doc, access)) throw notFound("Écrit");
    throw forbidden("Seul l'auteur ou un validateur peut modifier cet écrit.");
  }
  return { doc, isMember };
}

function assertTransition(status: Status, action: WorkflowAction) {
  if (!canTransition(status, action)) nextStatus(status, action); // lève une WorkflowError explicite
}

function wrapWorkflow<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof WorkflowError) throw new AppError("CONFLICT", e.message);
    throw e;
  }
}

export function engineInputFromDocument(doc: DocWithCase): EngineInput {
  return {
    documentType: doc.type as DocumentTypeKey,
    notes: decrypt(doc.notesEnc),
    childAlias: decryptOptional(doc.caseFile.childAliasEnc),
    caseReference: doc.caseFile.reference,
    authorName: doc.authorName,
    authorJobTitle: doc.authorJobTitle,
    serviceName: doc.serviceName,
    meetingDate: doc.meetingDate.toISOString().slice(0, 10),
    meetingTime: doc.meetingTime,
    meetingLocation: decryptOptional(doc.meetingLocationEnc),
    interviewType: doc.interviewType,
    purpose: decryptOptional(doc.purposeEnc),
    attendees: decryptOptional(doc.attendeesEnc),
    recipient: doc.recipient,
  };
}

// ---------------------------------------------------------------------------------------------
// Création et modification des informations sources
// ---------------------------------------------------------------------------------------------

export async function createDocument(actor: Actor & { fullName: string }, raw: unknown, ip?: string) {
  const parsed = documentInputSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Le formulaire contient des erreurs.", fieldErrors(parsed.error));
  const input = parsed.data;
  const { caseFile, isMember } = await loadCaseFile(actor, input.caseFileId);
  if (caseFile.status !== "ACTIVE") throw invalid("Ce dossier est archivé : aucun nouvel écrit ne peut y être créé.");
  if (!isMember) throw forbidden("Vous devez être membre du dossier pour y créer un écrit.");
  const template = getTemplate(input.type);
  const doc = await db.document.create({
    data: {
      organizationId: actor.organizationId!,
      caseFileId: caseFile.id,
      type: input.type,
      status: "DRAFT",
      authorId: actor.id,
      authorName: actor.fullName,
      authorJobTitle: input.authorJobTitle,
      serviceName: input.serviceName,
      meetingDate: new Date(input.meetingDate + "T00:00:00Z"),
      meetingTime: input.meetingTime,
      meetingLocationEnc: encryptOptional(input.meetingLocation),
      interviewType: input.interviewType,
      purposeEnc: encryptOptional(input.purpose),
      attendeesEnc: encryptOptional(input.attendees),
      recipient: input.recipient ?? template.defaultRecipient ?? null,
      notesEnc: encrypt(input.notes),
    },
  });
  await audit({ action: "document.created", organizationId: actor.organizationId, actorId: actor.id, resourceType: "document", resourceId: doc.id, metadata: { type: input.type }, ipAddress: ip });
  return doc;
}

export async function updateDocumentInputs(actor: Actor, id: string, raw: unknown, ip?: string) {
  const { doc } = await loadDocument(actor, id, "edit");
  wrapWorkflow(() => assertTransition(doc.status as Status, "EDIT_NOTES"));
  const parsed = documentUpdateSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Le formulaire contient des erreurs.", fieldErrors(parsed.error));
  const input = parsed.data;
  await db.document.update({
    where: { id },
    data: {
      authorJobTitle: input.authorJobTitle,
      serviceName: input.serviceName,
      meetingDate: new Date(input.meetingDate + "T00:00:00Z"),
      meetingTime: input.meetingTime,
      meetingLocationEnc: encryptOptional(input.meetingLocation),
      interviewType: input.interviewType,
      purposeEnc: encryptOptional(input.purpose),
      attendeesEnc: encryptOptional(input.attendees),
      recipient: input.recipient,
      notesEnc: encrypt(input.notes),
      // toute modification des sources impose une nouvelle relecture
      status: doc.status === "DRAFT" ? "DRAFT" : "TO_REVIEW",
    },
  });
  await audit({ action: "document.notes_updated", organizationId: actor.organizationId, actorId: actor.id, resourceType: "document", resourceId: id, ipAddress: ip });
}

// ---------------------------------------------------------------------------------------------
// Génération (moteur de rédaction)
// ---------------------------------------------------------------------------------------------

export async function generateDocument(actor: Actor, id: string, ip?: string) {
  const { doc } = await loadDocument(actor, id, "edit");
  wrapWorkflow(() => assertTransition(doc.status as Status, "GENERATE"));
  const provider = getProvider();
  const input = engineInputFromDocument(doc);
  const result = await runDraftingPipeline(input, provider);
  const version = doc.currentVersion + 1;
  await db.$transaction(async (tx) => {
    await tx.documentVersion.create({
      data: {
        documentId: id,
        version,
        contentEnc: encryptJson(result.content),
        analysisEnc: encryptJson(result.analysis),
        origin: "GENERATED",
        engine: provider.id,
        changeSummary: version === 1 ? "Projet généré à partir des notes" : "Nouvelle génération à partir des notes",
        createdById: actor.id,
      },
    });
    await tx.document.update({
      where: { id },
      data: { currentVersion: version, status: "GENERATED", reviewedAt: null, reviewedById: null },
    });
    const sum = summarize(result.claims);
    await audit(
      {
        action: "document.generated",
        organizationId: actor.organizationId,
        actorId: actor.id,
        resourceType: "document",
        resourceId: id,
        metadata: { version, engine: provider.id, green: sum.green, orange: sum.orange, red: sum.red },
        ipAddress: ip,
      },
      tx,
    );
  });
  return { version };
}

// ---------------------------------------------------------------------------------------------
// Espace de travail : lecture, vérification, complétude, contrôle qualité
// ---------------------------------------------------------------------------------------------

async function currentVersionRow(docId: string, version: number) {
  if (version === 0) return null;
  return db.documentVersion.findUnique({ where: { documentId_version: { documentId: docId, version } } });
}

function evaluate(doc: DocWithCase, input: EngineInput, content: ReportContent, analysis: Analysis | null) {
  const segments = buildSourceSegments(input);
  const claims = verifyReport(content, { segments, childAlias: input.childAlias });
  const ci = { documentType: doc.type as DocumentTypeKey, content, analysis, form: input };
  const alerts = completenessAlerts(ci);
  const checks = qualityChecks(ci, claims, input.childAlias);
  return { segments, claims, alerts, checks, indicator: qualityIndicator(checks), summary: summarize(claims) };
}

export async function getDocumentWorkspace(actor: Actor, id: string, opts: { logView?: boolean } = {}) {
  const { doc, isMember } = await loadDocument(actor, id, "read");
  const org = await db.organization.findUniqueOrThrow({ where: { id: doc.organizationId } });
  const input = engineInputFromDocument(doc);
  const row = await currentVersionRow(id, doc.currentVersion);
  const content = row ? decryptJson<ReportContent>(row.contentEnc) : null;
  const analysis = row?.analysisEnc ? decryptJson<Analysis>(row.analysisEnc) : await latestAnalysis(id);
  const evaluation = content ? evaluate(doc, input, content, analysis) : null;
  const versions = await db.documentVersion.findMany({
    where: { documentId: id },
    orderBy: { version: "desc" },
    select: { version: true, origin: true, changeSummary: true, createdAt: true, engine: true, createdBy: { select: { fullName: true } } },
  });
  const validator = doc.validatedById ? await db.user.findUnique({ where: { id: doc.validatedById }, select: { fullName: true, jobTitle: true } }) : null;
  const reviewer = doc.reviewedById ? await db.user.findUnique({ where: { id: doc.reviewedById }, select: { fullName: true } }) : null;
  const access = { isMember };
  const status = doc.status as Status;
  if (opts.logView) {
    await audit({ action: "document.viewed", organizationId: actor.organizationId, actorId: actor.id, resourceType: "document", resourceId: id });
  }
  return {
    id: doc.id,
    caseFileId: doc.caseFileId,
    caseReference: doc.caseFile.reference,
    type: doc.type as DocumentTypeKey,
    status,
    authorId: doc.authorId,
    authorName: doc.authorName,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    currentVersion: doc.currentVersion,
    validatedAt: doc.validatedAt,
    validatedVersion: doc.validatedVersion,
    validator,
    reviewedAt: doc.reviewedAt,
    reviewer,
    firstExportedAt: doc.firstExportedAt,
    archivedAt: doc.archivedAt,
    validationMode: org.validationMode,
    input,
    content,
    analysis,
    engine: row?.engine ?? null,
    evaluation,
    versions: versions.map((v) => ({ ...v, createdByName: v.createdBy.fullName })),
    permissions: {
      edit: canEditDocument(actor, doc, access) && isEditable(status),
      editNotes: canEditDocument(actor, doc, access) && canTransition(status, "EDIT_NOTES"),
      generate: canEditDocument(actor, doc, access) && canTransition(status, "GENERATE"),
      review: canEditDocument(actor, doc, access) && canTransition(status, "MARK_REVIEWED"),
      validate: canValidateDocument(actor, doc, access, org.validationMode) && canTransition(status, "VALIDATE"),
      reopen: (canValidateDocument(actor, doc, access, org.validationMode) || canEditDocument(actor, doc, access)) && canTransition(status, "REOPEN"),
      exportFinal: canExportDocument(actor, doc, access) && canTransition(status, "EXPORT_FINAL"),
      exportDraft: canExportDocument(actor, doc, access) && !!content,
      archive: canArchiveDocument(actor, doc, access) && canTransition(status, "ARCHIVE"),
      delete: canDeleteDocument(actor, doc, access),
    },
  };
}

export type DocumentWorkspace = Awaited<ReturnType<typeof getDocumentWorkspace>>;

async function latestAnalysis(id: string): Promise<Analysis | null> {
  const row = await db.documentVersion.findFirst({ where: { documentId: id, analysisEnc: { not: null } }, orderBy: { version: "desc" } });
  return row?.analysisEnc ? decryptJson<Analysis>(row.analysisEnc) : null;
}

export async function getDocumentVersion(actor: Actor, id: string, version: number) {
  await loadDocument(actor, id, "read");
  const row = await db.documentVersion.findUnique({
    where: { documentId_version: { documentId: id, version } },
    include: { createdBy: { select: { fullName: true } } },
  });
  if (!row) throw notFound("Version");
  return {
    version: row.version,
    origin: row.origin,
    changeSummary: row.changeSummary,
    createdAt: row.createdAt,
    createdByName: row.createdBy.fullName,
    content: decryptJson<ReportContent>(row.contentEnc),
  };
}

// ---------------------------------------------------------------------------------------------
// Édition et versions
// ---------------------------------------------------------------------------------------------

async function writeVersion(
  actor: Actor,
  doc: DocWithCase,
  content: ReportContent,
  origin: "MANUAL" | "RESTORED",
  changeSummary: string | null,
  action: "document.saved" | "document.version_restored" | "document.claim_confirmed",
  ip?: string,
) {
  const status = wrapWorkflow(() => nextStatus(doc.status as Status, "EDIT"));
  const version = doc.currentVersion + 1;
  const prev = await currentVersionRow(doc.id, doc.currentVersion);
  await db.$transaction(async (tx) => {
    // Verrou optimiste : échoue si une autre modification a été enregistrée entre-temps
    const updated = await tx.document.updateMany({
      where: { id: doc.id, currentVersion: doc.currentVersion },
      data: { currentVersion: version, status, reviewedAt: null, reviewedById: null },
    });
    if (updated.count !== 1) throw new AppError("CONFLICT", "Le document a été modifié entre-temps. Rechargez la page avant d'enregistrer.");
    await tx.documentVersion.create({
      data: {
        documentId: doc.id,
        version,
        contentEnc: encryptJson(content),
        analysisEnc: prev?.analysisEnc ?? null,
        origin,
        engine: prev?.engine ?? null,
        changeSummary,
        createdById: actor.id,
      },
    });
    await audit({ action, organizationId: actor.organizationId, actorId: actor.id, resourceType: "document", resourceId: doc.id, metadata: { version }, ipAddress: ip }, tx);
  });
  return { version, status };
}

export async function saveDocumentContent(actor: Actor, id: string, raw: unknown, ip?: string) {
  const { doc } = await loadDocument(actor, id, "edit");
  const parsed = saveContentSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Le contenu envoyé est invalide.", fieldErrors(parsed.error));
  if (parsed.data.baseVersion !== doc.currentVersion) {
    throw new AppError("CONFLICT", "Le document a été modifié entre-temps (nouvelle version). Rechargez la page pour repartir de la dernière version.");
  }
  const row = await currentVersionRow(id, doc.currentVersion);
  if (!row) throw invalid("Générez d'abord le projet d'écrit avant de le modifier.");
  const prev = decryptJson<ReportContent>(row.contentEnc);
  const texts = new Map(parsed.data.sections.map((s) => [s.key, s.text.replace(/\r\n/g, "\n")]));
  const content: ReportContent = {
    sections: prev.sections.map((s) => ({ ...s, text: texts.has(s.key) ? texts.get(s.key)! : s.text })),
    acknowledgements: prev.acknowledgements,
  };
  const unchanged = content.sections.every((s, i) => s.text === prev.sections[i]?.text);
  if (unchanged) return { version: doc.currentVersion, status: doc.status as Status, unchanged: true };
  const res = await writeVersion(actor, doc, content, "MANUAL", parsed.data.changeSummary ?? "Modification manuelle", "document.saved", ip);
  return { ...res, unchanged: false };
}

export async function restoreVersion(actor: Actor & { fullName: string }, id: string, version: number, ip?: string) {
  const { doc } = await loadDocument(actor, id, "edit");
  const row = await db.documentVersion.findUnique({ where: { documentId_version: { documentId: id, version } } });
  if (!row) throw notFound("Version");
  const content = decryptJson<ReportContent>(row.contentEnc);
  return writeVersion(actor, doc, content, "RESTORED", `Restauration de la version ${version}`, "document.version_restored", ip);
}

/** Le professionnel confirme un passage non retrouvé dans les notes (avec justification). */
export async function confirmClaim(actor: Actor & { fullName: string }, id: string, claimText: string, note: string, ip?: string) {
  const { doc } = await loadDocument(actor, id, "edit");
  const trimmedNote = note.trim();
  if (trimmedNote.length < 5 || trimmedNote.length > 500) throw invalid("Précisez la source ou la justification (5 à 500 caractères).", { note: "Justification requise." });
  const row = await currentVersionRow(id, doc.currentVersion);
  if (!row) throw notFound("Contenu");
  const content = decryptJson<ReportContent>(row.contentEnc);
  const hash = claimHash(claimText);
  const input = engineInputFromDocument(doc);
  const claims = verifyReport(content, { segments: buildSourceSegments(input), childAlias: input.childAlias });
  if (!claims.some((c) => c.id === hash)) throw invalid("Ce passage ne figure plus dans la version actuelle.");
  content.acknowledgements = [
    ...content.acknowledgements.filter((a) => a.claimHash !== hash),
    { claimHash: hash, note: trimmedNote, userId: actor.id, userName: actor.fullName, at: new Date().toISOString() },
  ];
  return writeVersion(actor, doc, content, "MANUAL", "Confirmation d'un passage par le professionnel", "document.claim_confirmed", ip);
}

// ---------------------------------------------------------------------------------------------
// Relecture, validation, réouverture
// ---------------------------------------------------------------------------------------------

export async function markReviewed(actor: Actor, id: string, checkedItems: string[], ip?: string) {
  const { doc } = await loadDocument(actor, id, "edit");
  wrapWorkflow(() => assertTransition(doc.status as Status, "MARK_REVIEWED"));
  const missing = MANUAL_REVIEW_ITEMS.filter((i) => !checkedItems.includes(i.id));
  if (missing.length) throw invalid("Cochez chacun des points de la checklist de relecture.");
  const row = await currentVersionRow(id, doc.currentVersion);
  if (!row) throw invalid("Aucun contenu à relire.");
  const content = decryptJson<ReportContent>(row.contentEnc);
  const input = engineInputFromDocument(doc);
  const ev = evaluate(doc, input, content, null);
  if (ev.summary.redUnacknowledged > 0) {
    throw invalid(
      `${ev.summary.redUnacknowledged} passage(s) non retrouvé(s) dans les notes doivent être modifiés, supprimés ou confirmés avec justification avant de terminer la relecture.`,
    );
  }
  await db.document.update({ where: { id }, data: { status: "REVIEWED", reviewedAt: new Date(), reviewedById: actor.id } });
  await audit({ action: "document.reviewed", organizationId: actor.organizationId, actorId: actor.id, resourceType: "document", resourceId: id, metadata: { version: doc.currentVersion, orange: ev.summary.orange }, ipAddress: ip });
}

export async function validateDocument(actor: Actor, id: string, opts: { confirmation: boolean; version: number }, ip?: string) {
  const { doc, isMember } = await loadDocument(actor, id, "read");
  const org = await db.organization.findUniqueOrThrow({ where: { id: doc.organizationId } });
  if (!canValidateDocument(actor, doc, { isMember }, org.validationMode)) {
    throw forbidden(
      org.validationMode === "SUPERVISOR"
        ? "La validation est réservée à un validateur (chef de service) distinct de l'auteur."
        : "Vous n'avez pas les droits de validation sur cet écrit.",
    );
  }
  wrapWorkflow(() => assertTransition(doc.status as Status, "VALIDATE"));
  if (!opts.confirmation) throw invalid("Cochez la confirmation de relecture pour valider.");
  if (opts.version !== doc.currentVersion) throw new AppError("CONFLICT", "Une nouvelle version a été enregistrée : relisez-la avant de valider.");
  const row = await currentVersionRow(id, doc.currentVersion);
  if (!row) throw invalid("Aucun contenu à valider.");
  const content = decryptJson<ReportContent>(row.contentEnc);
  if (content.sections.some((s) => s.text.includes(PLACEHOLDER_PREFIX))) {
    throw invalid("Le document contient encore des passages « à compléter » : complétez-les ou supprimez-les avant validation.");
  }
  const ev = evaluate(doc, engineInputFromDocument(doc), content, null);
  if (ev.summary.redUnacknowledged > 0) throw invalid("Des passages non retrouvés dans les notes n'ont pas été traités.");
  const updated = await db.document.updateMany({
    where: { id, status: "REVIEWED", currentVersion: opts.version },
    data: { status: "VALIDATED", validatedById: actor.id, validatedAt: new Date(), validatedVersion: opts.version },
  });
  if (updated.count !== 1) throw new AppError("CONFLICT", "Le document a changé pendant la validation. Rechargez la page.");
  await audit({ action: "document.validated", organizationId: actor.organizationId, actorId: actor.id, resourceType: "document", resourceId: id, metadata: { version: opts.version, mode: org.validationMode }, ipAddress: ip });
}

export async function reopenDocument(actor: Actor, id: string, ip?: string) {
  const { doc, isMember } = await loadDocument(actor, id, "read");
  const org = await db.organization.findUniqueOrThrow({ where: { id: doc.organizationId } });
  const access = { isMember };
  if (!canValidateDocument(actor, doc, access, org.validationMode) && !canEditDocument(actor, doc, access)) throw forbidden();
  wrapWorkflow(() => assertTransition(doc.status as Status, "REOPEN"));
  await db.document.update({
    where: { id },
    data: { status: "TO_REVIEW", validatedById: null, validatedAt: null, validatedVersion: null, reviewedAt: null, reviewedById: null },
  });
  await audit({ action: "document.reopened", organizationId: actor.organizationId, actorId: actor.id, resourceType: "document", resourceId: id, metadata: { previousStatus: doc.status, version: doc.currentVersion }, ipAddress: ip });
}

// ---------------------------------------------------------------------------------------------
// Export, archivage, suppression
// ---------------------------------------------------------------------------------------------

/** Prépare les données d'export après contrôle des droits et du statut. */
export async function prepareExport(actor: Actor, id: string, mode: "final" | "draft") {
  const ws = await getDocumentWorkspace(actor, id);
  if (!ws.content) throw invalid("Aucun contenu à exporter : générez d'abord le projet d'écrit.");
  if (mode === "final") {
    if (!ws.permissions.exportFinal) {
      throw forbidden("L'export définitif n'est possible qu'après validation humaine du document.");
    }
    if (ws.validatedVersion !== ws.currentVersion) throw new AppError("CONFLICT", "La version validée ne correspond pas à la version actuelle.");
    await db.document.update({
      where: { id },
      data: { status: "EXPORTED", firstExportedAt: ws.firstExportedAt ?? new Date() },
    });
  } else if (!ws.permissions.exportDraft) {
    throw forbidden();
  }
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId! } });
  return { ws, org };
}

export async function logExport(actor: Actor, id: string, mode: "final" | "draft", format: string, version: number, ip?: string) {
  await audit({
    action: mode === "final" ? "document.exported" : "document.draft_exported",
    organizationId: actor.organizationId,
    actorId: actor.id,
    resourceType: "document",
    resourceId: id,
    metadata: { format, version },
    ipAddress: ip,
  });
}

export async function archiveDocument(actor: Actor, id: string, ip?: string) {
  const { doc } = await loadDocument(actor, id, "edit");
  wrapWorkflow(() => assertTransition(doc.status as Status, "ARCHIVE"));
  await db.document.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
  await audit({ action: "document.archived", organizationId: actor.organizationId, actorId: actor.id, resourceType: "document", resourceId: id, metadata: { previousStatus: doc.status }, ipAddress: ip });
}

/** Suppression définitive (brouillon non validé par son auteur, ou document archivé par l'administrateur). */
export async function deleteDocument(actor: Actor, id: string, ip?: string) {
  const doc = await db.document.findFirst({
    where: { id, organizationId: actor.organizationId ?? "__aucun__" },
    include: { caseFile: { select: { members: { where: { userId: actor.id }, select: { userId: true } } } } },
  });
  if (!doc) throw notFound("Écrit");
  if (!canDeleteDocument(actor, doc, { isMember: doc.caseFile.members.length > 0 })) throw forbidden("Vous ne pouvez pas supprimer cet écrit.");
  await db.$transaction(async (tx) => {
    await tx.document.delete({ where: { id } });
    await audit({ action: "document.deleted", organizationId: actor.organizationId, actorId: actor.id, resourceType: "document", resourceId: id, metadata: { status: doc.status, type: doc.type }, ipAddress: ip }, tx);
  });
}

// ---------------------------------------------------------------------------------------------
// Listes, recherche, tableau de bord
// ---------------------------------------------------------------------------------------------

export const PAGE_SIZE = 25;

export async function listDocuments(actor: Actor, rawFilters: Record<string, string | undefined>) {
  if (!canUseCaseContent(actor)) return { rows: [], total: 0, page: 1, filters: {} as DocumentFilters };
  const filters = documentFiltersSchema.parse(rawFilters);
  const page = filters.page ?? 1;
  const where: Prisma.DocumentWhereInput = {
    organizationId: actor.organizationId!,
    caseFile: visibleCaseFilesWhere(actor),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : { status: { not: "ARCHIVED" } }),
    ...(filters.authorId ? { authorId: filters.authorId } : {}),
    ...(filters.q ? { caseFile: { ...visibleCaseFilesWhere(actor), reference: { contains: filters.q, mode: "insensitive" } } } : {}),
    ...(filters.from || filters.to
      ? { meetingDate: { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lte: new Date(filters.to) } : {}) } }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.document.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        type: true,
        status: true,
        meetingDate: true,
        authorName: true,
        authorId: true,
        currentVersion: true,
        updatedAt: true,
        caseFile: { select: { id: true, reference: true } },
      },
    }),
    db.document.count({ where }),
  ]);
  return { rows, total, page, filters };
}

export async function listAuthors(actor: Actor) {
  if (!canUseCaseContent(actor)) return [];
  return db.user.findMany({
    where: { organizationId: actor.organizationId!, authoredDocuments: { some: {} } },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
}

export async function dashboard(actor: Actor & { fullName: string }) {
  if (!canUseCaseContent(actor)) return null;
  const visible: Prisma.DocumentWhereInput = { organizationId: actor.organizationId!, caseFile: visibleCaseFilesWhere(actor) };
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId! } });
  const [drafts, toReview, toValidate, validated, recent, caseFiles] = await Promise.all([
    db.document.count({ where: { ...visible, authorId: actor.id, status: { in: ["DRAFT", "GENERATED"] } } }),
    db.document.count({ where: { ...visible, authorId: actor.id, status: "TO_REVIEW" } }),
    db.document.count({
      where: {
        ...visible,
        status: "REVIEWED",
        ...(org.validationMode === "SUPERVISOR" ? (canSeeAllCaseFiles(actor) ? { authorId: { not: actor.id } } : { authorId: actor.id }) : {}),
      },
    }),
    db.document.count({ where: { ...visible, status: { in: ["VALIDATED", "EXPORTED"] }, validatedAt: { gte: new Date(Date.now() - 30 * 86400_000) } } }),
    db.document.findMany({
      where: { ...visible, status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, type: true, status: true, meetingDate: true, updatedAt: true, authorName: true, caseFile: { select: { reference: true } } },
    }),
    db.caseFile.count({ where: { ...visibleCaseFilesWhere(actor), status: "ACTIVE" } }),
  ]);
  return { drafts, toReview, toValidate, validated, recent, caseFiles, validationMode: org.validationMode };
}
