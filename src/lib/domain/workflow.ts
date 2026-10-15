/**
 * Workflow de validation humaine (cahier des charges § 13) :
 * Brouillon -> Généré -> À vérifier -> Relu -> Validé -> Exporté / Archivé
 */
export const STATUSES = ["DRAFT", "GENERATED", "TO_REVIEW", "REVIEWED", "VALIDATED", "EXPORTED", "ARCHIVED"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  DRAFT: "Brouillon",
  GENERATED: "Généré",
  TO_REVIEW: "À vérifier",
  REVIEWED: "Relu",
  VALIDATED: "Validé",
  EXPORTED: "Exporté",
  ARCHIVED: "Archivé",
};

export type WorkflowAction =
  | "GENERATE" // lancer (ou relancer) la génération à partir des notes
  | "EDIT" // enregistrer une modification du rapport
  | "EDIT_NOTES" // modifier les notes sources / informations générales
  | "MARK_REVIEWED" // déclarer la relecture terminée (checklist complétée)
  | "VALIDATE" // validation humaine
  | "REOPEN" // rouvrir un document validé pour correction (invalide la validation)
  | "EXPORT_FINAL" // export définitif PDF/DOCX
  | "ARCHIVE"
  | "DELETE";

const TRANSITIONS: Record<WorkflowAction, { from: readonly Status[]; to: Status | null }> = {
  GENERATE: { from: ["DRAFT", "GENERATED", "TO_REVIEW"], to: "GENERATED" },
  EDIT: { from: ["GENERATED", "TO_REVIEW", "REVIEWED"], to: "TO_REVIEW" },
  EDIT_NOTES: { from: ["DRAFT", "GENERATED", "TO_REVIEW"], to: null },
  MARK_REVIEWED: { from: ["GENERATED", "TO_REVIEW"], to: "REVIEWED" },
  VALIDATE: { from: ["REVIEWED"], to: "VALIDATED" },
  REOPEN: { from: ["VALIDATED", "EXPORTED"], to: "TO_REVIEW" },
  EXPORT_FINAL: { from: ["VALIDATED", "EXPORTED"], to: "EXPORTED" },
  ARCHIVE: { from: ["DRAFT", "GENERATED", "TO_REVIEW", "REVIEWED", "VALIDATED", "EXPORTED"], to: "ARCHIVED" },
  DELETE: { from: ["DRAFT", "GENERATED", "TO_REVIEW", "REVIEWED", "ARCHIVED"], to: null },
};

export function canTransition(status: Status, action: WorkflowAction): boolean {
  return TRANSITIONS[action].from.includes(status);
}

/** Statut résultant d'une action (inchangé si l'action ne modifie pas le statut). */
export function nextStatus(status: Status, action: WorkflowAction): Status {
  if (!canTransition(status, action)) {
    throw new WorkflowError(`Action « ${action} » impossible pour un document au statut « ${STATUS_LABELS[status]} ».`);
  }
  return TRANSITIONS[action].to ?? status;
}

export class WorkflowError extends Error {}

export const isFinalExportAllowed = (status: Status) => status === "VALIDATED" || status === "EXPORTED";
export const isEditable = (status: Status) => ["DRAFT", "GENERATED", "TO_REVIEW", "REVIEWED"].includes(status);
export const isValidated = (status: Status) => status === "VALIDATED" || status === "EXPORTED";
