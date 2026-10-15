import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

type Tx = PrismaClient | Prisma.TransactionClient;

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.locked"
  | "auth.password_reset_requested"
  | "auth.password_reset"
  | "auth.password_changed"
  | "auth.invitation_accepted"
  | "user.invited"
  | "user.updated"
  | "user.deactivated"
  | "user.reactivated"
  | "invitation.revoked"
  | "organization.created"
  | "organization.updated"
  | "casefile.created"
  | "casefile.updated"
  | "casefile.member_added"
  | "casefile.member_removed"
  | "casefile.archived"
  | "document.created"
  | "document.viewed"
  | "document.notes_updated"
  | "document.generated"
  | "document.saved"
  | "document.version_restored"
  | "document.claim_confirmed"
  | "document.reviewed"
  | "document.validated"
  | "document.reopened"
  | "document.exported"
  | "document.draft_exported"
  | "document.archived"
  | "document.deleted"
  | "retention.purged"
  | "access.denied";

export type AuditEntry = {
  action: AuditAction;
  organizationId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
  resourceType?: string;
  resourceId?: string;
  /** Métadonnées techniques uniquement : jamais de notes, de propos ni de contenu de rapport. */
  metadata?: Record<string, string | number | boolean | null>;
  ipAddress?: string | null;
};

export async function audit(entry: AuditEntry, tx: Tx = db): Promise<void> {
  await tx.auditLog.create({
    data: {
      action: entry.action,
      organizationId: entry.organizationId ?? null,
      actorId: entry.actorId ?? null,
      actorEmail: entry.actorEmail ?? null,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      metadata: entry.metadata ?? undefined,
      ipAddress: entry.ipAddress ?? null,
    },
  });
}

export const AUDIT_LABELS: Record<AuditAction, string> = {
  "auth.login": "Connexion",
  "auth.login_failed": "Échec de connexion",
  "auth.logout": "Déconnexion",
  "auth.locked": "Compte verrouillé temporairement",
  "auth.password_reset_requested": "Demande de réinitialisation du mot de passe",
  "auth.password_reset": "Mot de passe réinitialisé",
  "auth.password_changed": "Mot de passe modifié",
  "auth.invitation_accepted": "Invitation acceptée",
  "user.invited": "Utilisateur invité",
  "user.updated": "Utilisateur modifié",
  "user.deactivated": "Utilisateur désactivé",
  "user.reactivated": "Utilisateur réactivé",
  "invitation.revoked": "Invitation révoquée",
  "organization.created": "Organisation créée",
  "organization.updated": "Paramètres de l'établissement modifiés",
  "casefile.created": "Dossier créé",
  "casefile.updated": "Dossier modifié",
  "casefile.member_added": "Membre ajouté au dossier",
  "casefile.member_removed": "Membre retiré du dossier",
  "casefile.archived": "Dossier archivé",
  "document.created": "Écrit créé",
  "document.viewed": "Écrit consulté",
  "document.notes_updated": "Notes sources modifiées",
  "document.generated": "Projet d'écrit généré",
  "document.saved": "Nouvelle version enregistrée",
  "document.version_restored": "Version restaurée",
  "document.claim_confirmed": "Passage non retrouvé confirmé par le professionnel",
  "document.reviewed": "Relecture déclarée terminée",
  "document.validated": "Écrit validé",
  "document.reopened": "Écrit rouvert pour correction",
  "document.exported": "Export définitif",
  "document.draft_exported": "Export de travail (brouillon)",
  "document.archived": "Écrit archivé",
  "document.deleted": "Écrit supprimé",
  "retention.purged": "Purge de conservation",
  "access.denied": "Accès refusé",
};
