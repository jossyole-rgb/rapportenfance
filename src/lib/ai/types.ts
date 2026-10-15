import type { Category, SectionKey } from "@/lib/domain/categories";
import type { DocumentTypeKey } from "@/lib/domain/document-types";

/** Données d'entrée du moteur : formulaire + notes du professionnel. */
export type EngineInput = {
  documentType: DocumentTypeKey;
  notes: string;
  childAlias?: string | null;
  caseReference: string;
  authorName: string;
  authorJobTitle?: string | null;
  serviceName?: string | null;
  meetingDate: string; // AAAA-MM-JJ
  meetingTime?: string | null;
  meetingLocation?: string | null;
  interviewType?: string | null;
  purpose?: string | null;
  attendees?: string | null;
  recipient?: string | null;
};

/** Élément source : un passage des notes ou un champ du formulaire. */
export type SourceSegment = {
  id: string;
  origin: "NOTES" | "FORM";
  label?: string; // nom du champ pour les sources formulaire
  text: string;
  start: number;
  end: number;
};

export type Actor = "CHILD" | "PARENT" | "THIRD_PARTY" | "PROFESSIONAL" | "NONE";

/** Étapes 2 et 3 : information extraite puis classée. */
export type ClassifiedItem = {
  id: string;
  segmentId: string;
  category: Category;
  actor: Actor;
  actorLabel?: string; // "la mère", "Lucas", "l'école"...
  confidence: "HIGH" | "MEDIUM" | "LOW";
  rationale: string; // explication lisible de la classification
  flags: Array<"CONTEXTE" | "MOTS_VIGILANCE" | "MOTS_RESSOURCE" | "INFO_SCOLAIRE" | "INFO_SANTE" | "SOURCE_NON_PRECISEE">;
};

/** Suggestion affichée au professionnel, jamais insérée automatiquement dans le rapport. */
export type Suggestion = {
  id: string;
  segmentId: string;
  kind: "VIGILANCE" | "RESSOURCE" | "CLASSIFICATION_INCERTAINE";
  message: string;
};

export type Analysis = {
  engine: string;
  engineLabel: string;
  generatedAt: string;
  segments: SourceSegment[];
  items: ClassifiedItem[];
  suggestions: Suggestion[];
};

export type ReportSection = {
  key: SectionKey;
  title: string;
  required: boolean;
  text: string; // un paragraphe ou élément par ligne
};

export type Acknowledgement = {
  claimHash: string;
  note: string;
  userId: string;
  userName: string;
  at: string;
};

export type ReportContent = {
  sections: ReportSection[];
  acknowledgements: Acknowledgement[];
};

export type VerificationLevel = "GREEN" | "ORANGE" | "RED";

export type VerifiedClaim = {
  id: string; // hachage stable du texte normalisé
  sectionKey: SectionKey;
  text: string;
  level: VerificationLevel;
  score: number;
  reasons: string[];
  sourceSegmentIds: string[];
  acknowledged: Acknowledgement | null;
};

export type CompletenessAlert = {
  id: string;
  severity: "warning" | "info";
  message: string;
  sectionKey?: SectionKey;
};

/** Fournisseur de rédaction : étapes 1 à 4 (analyse, extraction, classification, construction). */
export interface DraftingProvider {
  id: string;
  label: string;
  /** true si le fournisseur transmet des données à un service tiers. */
  external: boolean;
  analyze(input: EngineInput): Promise<Analysis>;
  compose(input: EngineInput, analysis: Analysis): Promise<ReportSection[]>;
}

export const PLACEHOLDER_PREFIX = "[À compléter";
