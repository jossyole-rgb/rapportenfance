import { getTemplate, type DocumentTypeKey } from "@/lib/domain/document-types";
import { STATUS_LABELS, isValidated, type Status } from "@/lib/domain/workflow";
import type { ReportContent } from "@/lib/ai/types";

export const DRAFT_MARK = "BROUILLON NON VALIDÉ";
export const CONFIDENTIAL_FOOTER = "Document confidentiel - données personnelles relatives à un mineur - diffusion restreinte";

export type ExportModel = {
  draft: boolean;
  header: string[];
  title: string;
  meta: Array<[string, string]>;
  sections: Array<{ title: string; paragraphs: string[] }>;
  validationStatement: string;
};

const fmtDate = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
const fmtDateTime = (d: Date) =>
  d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

export function buildExportModel(args: {
  mode: "final" | "draft";
  org: { name: string; headerLine1: string | null; headerLine2: string | null; headerLine3: string | null };
  doc: {
    type: DocumentTypeKey;
    status: Status;
    caseReference: string;
    authorName: string;
    authorJobTitle?: string | null;
    serviceName?: string | null;
    meetingDate: string;
    recipient?: string | null;
    currentVersion: number;
    createdAt: Date;
    updatedAt: Date;
    validatedAt: Date | null;
    validatorName: string | null;
  };
  content: ReportContent;
}): ExportModel {
  const { doc, org } = args;
  const draft = args.mode === "draft" || !isValidated(doc.status);
  const header = [org.headerLine1 || org.name, org.headerLine2, org.headerLine3].filter(Boolean) as string[];
  const [y, m, d] = doc.meetingDate.split("-");
  const meta: Array<[string, string]> = [
    ["Dossier", doc.caseReference],
    ["Date du rendez-vous", `${d}/${m}/${y}`],
    ["Rédacteur", [doc.authorName, doc.authorJobTitle].filter(Boolean).join(", ")],
    ...(doc.serviceName ? ([["Service", doc.serviceName]] as Array<[string, string]>) : []),
    ...(doc.recipient ? ([["Destinataire", doc.recipient]] as Array<[string, string]>) : []),
    ["Version", String(doc.currentVersion)],
    ["Créé le", fmtDate(doc.createdAt)],
    ["Dernière modification", fmtDateTime(doc.updatedAt)],
    ["Statut", draft ? `${STATUS_LABELS[doc.status]} - ${DRAFT_MARK}` : STATUS_LABELS[doc.status === "EXPORTED" ? "VALIDATED" : doc.status]],
  ];
  if (!draft && doc.validatedAt) {
    meta.push(["Validé par", doc.validatorName ?? "-"], ["Validé le", fmtDateTime(doc.validatedAt)]);
  }
  const sections = args.content.sections
    .map((s) => ({ title: s.title, paragraphs: s.text.split("\n").map((p) => p.trim()).filter(Boolean) }))
    .filter((s) => s.paragraphs.length > 0);
  return {
    draft,
    header,
    title: getTemplate(doc.type).label,
    meta,
    sections,
    validationStatement: draft
      ? "Document de travail non validé : il ne peut être ni diffusé ni utilisé comme écrit définitif."
      : `Document relu et validé par ${doc.validatorName ?? "le professionnel habilité"} le ${doc.validatedAt ? fmtDateTime(doc.validatedAt) : "-"}. Rédaction assistée par un outil numérique ; le contenu relève de la responsabilité des professionnels signataires.`,
  };
}
