import type { Status } from "@/lib/domain/workflow";

export type RoleKey = "PROFESSIONAL" | "VALIDATOR" | "ORG_ADMIN" | "TECH_ADMIN";

export const ROLE_LABELS: Record<RoleKey, string> = {
  PROFESSIONAL: "Professionnel",
  VALIDATOR: "Validateur / chef de service",
  ORG_ADMIN: "Administrateur établissement",
  TECH_ADMIN: "Administrateur technique",
};

/** Utilisateur authentifié tel que vu par les contrôles d'accès. */
export type Actor = {
  id: string;
  organizationId: string | null;
  roles: RoleKey[];
};

export const hasRole = (actor: Actor, ...roles: RoleKey[]) => roles.some((r) => actor.roles.includes(r));

/** Accès au contenu métier (dossiers, écrits). L'administrateur technique n'y a jamais accès. */
export const canUseCaseContent = (actor: Actor) =>
  actor.organizationId !== null && hasRole(actor, "PROFESSIONAL", "VALIDATOR");

/** Voir tous les dossiers de l'établissement (et non uniquement ceux dont on est membre). */
export const canSeeAllCaseFiles = (actor: Actor) => actor.organizationId !== null && hasRole(actor, "VALIDATOR");

export const canManageUsers = (actor: Actor) => actor.organizationId !== null && hasRole(actor, "ORG_ADMIN");
export const canManageOrgSettings = canManageUsers;
export const canViewAuditLog = canManageUsers;
export const canManageOrganizations = (actor: Actor) => hasRole(actor, "TECH_ADMIN");

/** Gestion de la conservation : métadonnées et suppression des documents archivés, sans accès au contenu. */
export const canManageRetention = canManageUsers;

type DocLike = { organizationId: string; authorId: string; status: Status };
type CaseAccess = { isMember: boolean };

/** Lecture d'un écrit : même établissement ET (membre du dossier OU validateur). */
export function canReadDocument(actor: Actor, doc: DocLike, access: CaseAccess): boolean {
  if (!canUseCaseContent(actor) || actor.organizationId !== doc.organizationId) return false;
  return access.isMember || hasRole(actor, "VALIDATOR");
}

/** Modification : l'auteur, ou un validateur de l'établissement, tant que le document est modifiable. */
export function canEditDocument(actor: Actor, doc: DocLike, access: CaseAccess): boolean {
  if (!canReadDocument(actor, doc, access)) return false;
  return doc.authorId === actor.id || hasRole(actor, "VALIDATOR");
}

/**
 * Validation humaine.
 * - mode SUPERVISOR : réservé à un validateur distinct de l'auteur ;
 * - mode SELF : l'auteur (ou un validateur) peut valider après confirmation de relecture.
 */
export function canValidateDocument(
  actor: Actor,
  doc: DocLike,
  access: CaseAccess,
  mode: "SELF" | "SUPERVISOR",
): boolean {
  if (!canReadDocument(actor, doc, access)) return false;
  if (mode === "SUPERVISOR") return hasRole(actor, "VALIDATOR") && doc.authorId !== actor.id;
  return doc.authorId === actor.id || hasRole(actor, "VALIDATOR");
}

export const canExportDocument = canReadDocument;
export const canArchiveDocument = canEditDocument;

/** Suppression d'un brouillon non validé par son auteur, ou d'un document archivé par l'administrateur. */
export function canDeleteDocument(actor: Actor, doc: DocLike, access: CaseAccess): boolean {
  if (actor.organizationId !== doc.organizationId) return false;
  if (doc.status === "ARCHIVED") return canManageRetention(actor);
  return ["DRAFT", "GENERATED", "TO_REVIEW", "REVIEWED"].includes(doc.status) && canEditDocument(actor, doc, access) && doc.authorId === actor.id;
}
