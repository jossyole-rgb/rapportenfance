import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { AppError, forbidden, invalid, notFound } from "@/lib/errors";
import { canManageOrganizations, canManageOrgSettings, canManageRetention, canManageUsers, canViewAuditLog, type Actor, type RoleKey } from "@/lib/auth/permissions";
import { fieldErrors } from "@/lib/validation";
import { hashPassword, checkPasswordPolicy } from "@/lib/security/password";

// ---------------------------------------------------------------------------------------------
// Utilisateurs de l'établissement
// ---------------------------------------------------------------------------------------------

export async function listOrgUsers(actor: Actor) {
  if (!canManageUsers(actor)) throw forbidden();
  const [users, invitations] = await Promise.all([
    db.user.findMany({
      where: { organizationId: actor.organizationId! },
      orderBy: { fullName: "asc" },
      select: { id: true, email: true, fullName: true, jobTitle: true, roles: true, isActive: true, lastLoginAt: true, lockedUntil: true, totpEnabledAt: true },
    }),
    db.invitation.findMany({
      where: { organizationId: actor.organizationId!, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, fullName: true, roles: true, expiresAt: true },
    }),
  ]);
  return { users, invitations };
}

const userUpdateSchema = z.object({
  roles: z.array(z.enum(["PROFESSIONAL", "VALIDATOR", "ORG_ADMIN"])).min(1, "Au moins un rôle."),
  jobTitle: z.string().trim().max(120).optional(),
  isActive: z.boolean(),
});

export async function updateOrgUser(actor: Actor, userId: string, raw: unknown) {
  if (!canManageUsers(actor)) throw forbidden();
  const parsed = userUpdateSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Formulaire invalide.", fieldErrors(parsed.error));
  const user = await db.user.findFirst({ where: { id: userId, organizationId: actor.organizationId! } });
  if (!user) throw notFound("Utilisateur");
  if (userId === actor.id && (!parsed.data.isActive || !parsed.data.roles.includes("ORG_ADMIN"))) {
    throw new AppError("CONFLICT", "Vous ne pouvez pas retirer vos propres droits d'administration ni désactiver votre compte.");
  }
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { roles: parsed.data.roles as RoleKey[], jobTitle: parsed.data.jobTitle || null, isActive: parsed.data.isActive },
    });
    if (!parsed.data.isActive) await tx.session.deleteMany({ where: { userId } });
    const action = user.isActive && !parsed.data.isActive ? "user.deactivated" : !user.isActive && parsed.data.isActive ? "user.reactivated" : "user.updated";
    await audit({ action, organizationId: actor.organizationId, actorId: actor.id, resourceType: "user", resourceId: userId, metadata: { roles: parsed.data.roles.join(",") } }, tx);
  });
}

export async function revokeInvitation(actor: Actor, invitationId: string) {
  if (!canManageUsers(actor)) throw forbidden();
  const res = await db.invitation.updateMany({ where: { id: invitationId, organizationId: actor.organizationId!, acceptedAt: null }, data: { revokedAt: new Date() } });
  if (res.count !== 1) throw notFound("Invitation");
  await audit({ action: "invitation.revoked", organizationId: actor.organizationId, actorId: actor.id, resourceType: "invitation", resourceId: invitationId });
}

// ---------------------------------------------------------------------------------------------
// Paramètres de l'établissement
// ---------------------------------------------------------------------------------------------

const orgSettingsSchema = z.object({
  name: z.string().trim().min(2).max(160),
  headerLine1: z.string().trim().max(160).optional(),
  headerLine2: z.string().trim().max(160).optional(),
  headerLine3: z.string().trim().max(160).optional(),
  validationMode: z.enum(["SELF", "SUPERVISOR"]),
  retentionDays: z.coerce.number().int().min(30, "30 jours minimum.").max(36500),
  mfaRequired: z.boolean(),
  auditRetentionDays: z.coerce.number().int().min(90, "90 jours minimum.").max(3650, "10 ans maximum."),
});

export async function getOrgSettings(actor: Actor) {
  if (!canManageOrgSettings(actor)) throw forbidden();
  return db.organization.findUniqueOrThrow({ where: { id: actor.organizationId! } });
}

export async function updateOrgSettings(actor: Actor, raw: unknown) {
  if (!canManageOrgSettings(actor)) throw forbidden();
  const parsed = orgSettingsSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Formulaire invalide.", fieldErrors(parsed.error));
  const d = parsed.data;
  await db.organization.update({
    where: { id: actor.organizationId! },
    data: { ...d, headerLine1: d.headerLine1 || null, headerLine2: d.headerLine2 || null, headerLine3: d.headerLine3 || null },
  });
  await audit({ action: "organization.updated", organizationId: actor.organizationId, actorId: actor.id, resourceType: "organization", resourceId: actor.organizationId!, metadata: { validationMode: d.validationMode, retentionDays: d.retentionDays, mfaRequired: d.mfaRequired, auditRetentionDays: d.auditRetentionDays } });
}

// ---------------------------------------------------------------------------------------------
// Journal d'audit (sans contenu sensible)
// ---------------------------------------------------------------------------------------------

export async function listAuditLog(actor: Actor, opts: { page?: number; action?: string } = {}) {
  if (!canViewAuditLog(actor)) throw forbidden();
  const page = Math.max(1, Math.min(1000, opts.page ?? 1));
  const where = { organizationId: actor.organizationId!, ...(opts.action ? { action: opts.action } : {}) };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50 }),
    db.auditLog.count({ where }),
  ]);
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))] as string[];
  const users = await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } });
  const names = new Map(users.map((u) => [u.id, u.fullName]));
  return { rows: rows.map((r) => ({ ...r, actorName: r.actorId ? names.get(r.actorId) ?? null : null })), total, page };
}

// ---------------------------------------------------------------------------------------------
// Conservation : documents archivés (métadonnées uniquement) et purge
// ---------------------------------------------------------------------------------------------

export async function listArchivedDocuments(actor: Actor) {
  if (!canManageRetention(actor)) throw forbidden();
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId! } });
  const rows = await db.document.findMany({
    where: { organizationId: actor.organizationId!, status: "ARCHIVED" },
    orderBy: { archivedAt: "asc" },
    select: { id: true, type: true, archivedAt: true, authorName: true, caseFile: { select: { reference: true } } },
  });
  const limit = Date.now() - org.retentionDays * 86400_000;
  return { retentionDays: org.retentionDays, rows: rows.map((r) => ({ ...r, expired: !!r.archivedAt && r.archivedAt.getTime() < limit })) };
}

// ---------------------------------------------------------------------------------------------
// Administration technique : organisations
// ---------------------------------------------------------------------------------------------

export async function listOrganizations(actor: Actor) {
  if (!canManageOrganizations(actor)) throw forbidden();
  const orgs = await db.organization.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { users: true } } } });
  return orgs.map((o) => ({ id: o.id, name: o.name, slug: o.slug, isActive: o.isActive, users: o._count.users, createdAt: o.createdAt }));
}

const newOrgSchema = z.object({
  name: z.string().trim().min(2, "Nom requis.").max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, "Minuscules, chiffres et tirets (2 à 40)."),
  adminEmail: z.string().trim().toLowerCase().email("E-mail invalide."),
  adminName: z.string().trim().min(2, "Nom requis.").max(120),
  adminPassword: z.string().min(1, "Mot de passe requis."),
});

/** Crée un établissement et son premier administrateur (qui invitera ensuite ses utilisateurs). */
export async function createOrganization(actor: Actor, raw: unknown) {
  if (!canManageOrganizations(actor)) throw forbidden();
  const parsed = newOrgSchema.safeParse(raw);
  if (!parsed.success) throw invalid("Formulaire invalide.", fieldErrors(parsed.error));
  const d = parsed.data;
  const problems = checkPasswordPolicy(d.adminPassword, { email: d.adminEmail });
  if (problems.length) throw invalid(`Mot de passe : ${problems.join(" ; ")}.`, { adminPassword: problems.join(" ; ") });
  if (await db.organization.findUnique({ where: { slug: d.slug } })) throw invalid("Identifiant déjà utilisé.", { slug: "Déjà utilisé." });
  if (await db.user.findUnique({ where: { email: d.adminEmail } })) throw invalid("E-mail déjà utilisé.", { adminEmail: "Déjà utilisé." });
  const org = await db.$transaction(async (tx) => {
    const o = await tx.organization.create({ data: { name: d.name, slug: d.slug, headerLine1: d.name } });
    await tx.user.create({
      data: { organizationId: o.id, email: d.adminEmail, fullName: d.adminName, roles: ["ORG_ADMIN"], passwordHash: await hashPassword(d.adminPassword) },
    });
    await audit({ action: "organization.created", organizationId: o.id, actorId: actor.id, resourceType: "organization", resourceId: o.id }, tx);
    return o;
  });
  return org;
}

export async function setOrganizationActive(actor: Actor, orgId: string, isActive: boolean) {
  if (!canManageOrganizations(actor)) throw forbidden();
  await db.organization.update({ where: { id: orgId }, data: { isActive } });
  if (!isActive) await db.session.deleteMany({ where: { user: { organizationId: orgId } } });
  await audit({ action: "organization.updated", organizationId: orgId, actorId: actor.id, resourceType: "organization", resourceId: orgId, metadata: { isActive } });
}
