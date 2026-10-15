import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, forbidden, invalid, notFound } from "@/lib/errors";
import { canSeeAllCaseFiles, canUseCaseContent, hasRole, type Actor } from "@/lib/auth/permissions";
import { decryptOptional, encryptOptional } from "@/lib/security/crypto";
import { caseFileSchema, fieldErrors } from "@/lib/validation";

/** Filtre Prisma limitant les dossiers visibles par l'utilisateur (établissement + appartenance). */
export function visibleCaseFilesWhere(actor: Actor): Prisma.CaseFileWhereInput {
  if (!canUseCaseContent(actor)) return { id: "__aucun__" };
  const base: Prisma.CaseFileWhereInput = { organizationId: actor.organizationId! };
  return canSeeAllCaseFiles(actor) ? base : { ...base, members: { some: { userId: actor.id } } };
}

export async function listCaseFiles(actor: Actor, opts: { q?: string; includeArchived?: boolean } = {}) {
  const where: Prisma.CaseFileWhereInput = {
    ...visibleCaseFilesWhere(actor),
    ...(opts.includeArchived ? {} : { status: "ACTIVE" }),
    ...(opts.q ? { reference: { contains: opts.q, mode: "insensitive" } } : {}),
  };
  const rows = await db.caseFile.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: {
      _count: { select: { documents: true } },
      members: { include: { user: { select: { id: true, fullName: true } } } },
      documents: { select: { updatedAt: true, status: true }, orderBy: { updatedAt: "desc" }, take: 1 },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    reference: r.reference,
    childAlias: decryptOptional(r.childAliasEnc),
    serviceName: r.serviceName,
    status: r.status,
    documentCount: r._count.documents,
    members: r.members.map((m) => m.user),
    lastActivity: r.documents[0]?.updatedAt ?? r.updatedAt,
    createdAt: r.createdAt,
  }));
}

export async function createCaseFile(actor: Actor, input: unknown, ip?: string) {
  if (!canUseCaseContent(actor)) throw forbidden();
  const parsed = caseFileSchema.safeParse(input);
  if (!parsed.success) throw invalid("Le formulaire contient des erreurs.", fieldErrors(parsed.error));
  const { reference, childAlias, serviceName } = parsed.data;
  const exists = await db.caseFile.findUnique({ where: { organizationId_reference: { organizationId: actor.organizationId!, reference } } });
  if (exists) throw invalid("Cet identifiant de dossier existe déjà dans votre établissement.", { reference: "Identifiant déjà utilisé." });
  const caseFile = await db.caseFile.create({
    data: {
      organizationId: actor.organizationId!,
      reference,
      childAliasEnc: encryptOptional(childAlias),
      serviceName,
      createdById: actor.id,
      members: { create: { userId: actor.id } },
    },
  });
  await audit({ action: "casefile.created", organizationId: actor.organizationId, actorId: actor.id, resourceType: "casefile", resourceId: caseFile.id, ipAddress: ip });
  return caseFile;
}

/** Charge un dossier en vérifiant établissement et appartenance. */
export async function loadCaseFile(actor: Actor, id: string) {
  if (!canUseCaseContent(actor)) throw notFound("Dossier");
  const cf = await db.caseFile.findFirst({
    where: { id, organizationId: actor.organizationId! },
    include: { members: { include: { user: { select: { id: true, fullName: true, jobTitle: true, isActive: true } } } } },
  });
  if (!cf) throw notFound("Dossier");
  const isMember = cf.members.some((m) => m.userId === actor.id);
  if (!isMember && !canSeeAllCaseFiles(actor)) {
    await audit({ action: "access.denied", organizationId: actor.organizationId, actorId: actor.id, resourceType: "casefile", resourceId: id });
    throw notFound("Dossier");
  }
  return { caseFile: cf, isMember };
}

export async function getCaseFileDetail(actor: Actor, id: string) {
  const { caseFile, isMember } = await loadCaseFile(actor, id);
  const documents = await db.document.findMany({
    where: { caseFileId: id, organizationId: actor.organizationId! },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      type: true,
      status: true,
      meetingDate: true,
      authorName: true,
      currentVersion: true,
      updatedAt: true,
      validatedAt: true,
    },
  });
  return {
    id: caseFile.id,
    reference: caseFile.reference,
    childAlias: decryptOptional(caseFile.childAliasEnc),
    serviceName: caseFile.serviceName,
    status: caseFile.status,
    createdAt: caseFile.createdAt,
    members: caseFile.members.map((m) => m.user),
    isMember,
    canManageMembers: isMember || hasRole(actor, "VALIDATOR"),
    documents,
  };
}

export async function addCaseFileMember(actor: Actor, caseFileId: string, userId: string) {
  const { caseFile, isMember } = await loadCaseFile(actor, caseFileId);
  if (!isMember && !hasRole(actor, "VALIDATOR")) throw forbidden();
  const user = await db.user.findFirst({ where: { id: userId, organizationId: actor.organizationId!, isActive: true } });
  if (!user || !user.roles.some((r) => r === "PROFESSIONAL" || r === "VALIDATOR")) throw invalid("Utilisateur introuvable dans votre établissement.");
  if (caseFile.members.some((m) => m.userId === userId)) return;
  await db.caseFileMember.create({ data: { caseFileId, userId } });
  await audit({ action: "casefile.member_added", organizationId: actor.organizationId, actorId: actor.id, resourceType: "casefile", resourceId: caseFileId, metadata: { userId } });
}

export async function removeCaseFileMember(actor: Actor, caseFileId: string, userId: string) {
  const { caseFile, isMember } = await loadCaseFile(actor, caseFileId);
  if (!isMember && !hasRole(actor, "VALIDATOR")) throw forbidden();
  if (caseFile.members.length <= 1) throw new AppError("CONFLICT", "Un dossier doit conserver au moins un membre.");
  await db.caseFileMember.deleteMany({ where: { caseFileId, userId } });
  await audit({ action: "casefile.member_removed", organizationId: actor.organizationId, actorId: actor.id, resourceType: "casefile", resourceId: caseFileId, metadata: { userId } });
}

export async function setCaseFileArchived(actor: Actor, caseFileId: string, archived: boolean) {
  const { isMember } = await loadCaseFile(actor, caseFileId);
  if (!isMember && !hasRole(actor, "VALIDATOR")) throw forbidden();
  await db.caseFile.update({ where: { id: caseFileId }, data: { status: archived ? "ARCHIVED" : "ACTIVE" } });
  await audit({ action: archived ? "casefile.archived" : "casefile.updated", organizationId: actor.organizationId, actorId: actor.id, resourceType: "casefile", resourceId: caseFileId });
}

/** Professionnels de l'établissement pouvant être ajoutés à un dossier. */
export async function listAssignableUsers(actor: Actor) {
  if (!canUseCaseContent(actor)) return [];
  return db.user.findMany({
    where: { organizationId: actor.organizationId!, isActive: true, roles: { hasSome: ["PROFESSIONAL", "VALIDATOR"] } },
    select: { id: true, fullName: true, jobTitle: true },
    orderBy: { fullName: "asc" },
  });
}
