import type { SectionKey } from "./categories";

export const DOCUMENT_TYPES = [
  "NOTE_ENTRETIEN",
  "COMPTE_RENDU_VISITE",
  "VISITE_DOMICILE",
  "VISITE_MEDIATISEE",
  "NOTE_SITUATION",
  "RAPPORT_EDUCATIF",
  "RAPPORT_EVOLUTION",
  "SYNTHESE",
  "EVALUATION_SITUATION",
  "RAPPORT_ASE",
  "RAPPORT_MAGISTRAT",
  "INFORMATION_PREOCCUPANTE",
] as const;

export type DocumentTypeKey = (typeof DOCUMENT_TYPES)[number];

export type SectionTemplate = {
  key: SectionKey;
  title: string;
  required: boolean;
  hint?: string;
};

export type DocumentTemplate = {
  type: DocumentTypeKey;
  label: string;
  description: string;
  defaultRecipient?: string;
  toneNote: string;
  sections: SectionTemplate[];
};

const S = (key: SectionKey, title: string, required = false, hint?: string): SectionTemplate => ({
  key,
  title,
  required,
  hint,
});

const BASE: SectionTemplate[] = [
  S("INFOS_GENERALES", "Informations générales", true),
  S("OBJET_CONTEXTE", "Objet et contexte de l'entretien", true),
  S("ELEMENTS_RECUEILLIS", "Éléments recueillis"),
  S("EXPRESSION_ENFANT", "Expression de l'enfant", true, "Propos de l'enfant, attribués et reformulés au plus près."),
  S("EXPRESSION_PARENTS", "Expression des représentants légaux"),
  S("TIERS", "Informations provenant de tiers", false, "Toujours préciser la source de l'information."),
  S("OBSERVATIONS", "Observations professionnelles"),
  S("ANALYSE", "Éléments d'analyse", false, "Uniquement l'analyse explicitement formulée par le professionnel."),
  S("VIGILANCE", "Points de vigilance"),
  S("RESSOURCES", "Ressources et éléments favorables"),
  S("ACTIONS", "Actions réalisées"),
  S("PROCHAINES_ETAPES", "Prochaines étapes et échéances", true),
];

function withTitles(overrides: Partial<Record<SectionKey, Partial<SectionTemplate>>>, omit: SectionKey[] = []) {
  return BASE.filter((s) => !omit.includes(s.key)).map((s) => ({ ...s, ...(overrides[s.key] ?? {}) }));
}

export const DOCUMENT_TEMPLATES: Record<DocumentTypeKey, DocumentTemplate> = {
  NOTE_ENTRETIEN: {
    type: "NOTE_ENTRETIEN",
    label: "Note d'entretien",
    description: "Trace synthétique d'un entretien avec l'enfant et/ou sa famille.",
    toneNote: "Écrit court et factuel, centré sur les échanges de l'entretien.",
    sections: withTitles({ ANALYSE: { required: false } }),
  },
  COMPTE_RENDU_VISITE: {
    type: "COMPTE_RENDU_VISITE",
    label: "Compte rendu de visite",
    description: "Compte rendu d'une visite (lieu d'accueil, établissement, famille).",
    toneNote: "Décrire le déroulement de la visite de façon chronologique.",
    sections: withTitles({ OBJET_CONTEXTE: { title: "Objet et déroulement de la visite" } }),
  },
  VISITE_DOMICILE: {
    type: "VISITE_DOMICILE",
    label: "Visite à domicile",
    description: "Compte rendu d'une visite au domicile de la famille.",
    toneNote: "Distinguer strictement ce qui a été observé au domicile de ce qui a été rapporté.",
    sections: withTitles({
      OBJET_CONTEXTE: { title: "Objet et déroulement de la visite à domicile" },
      OBSERVATIONS: { title: "Observations au domicile", required: true },
    }),
  },
  VISITE_MEDIATISEE: {
    type: "VISITE_MEDIATISEE",
    label: "Visite en présence d'un tiers",
    description: "Compte rendu d'une visite en présence d'un tiers (visite médiatisée).",
    toneNote: "Décrire les interactions observées sans les qualifier au-delà de ce qui est observé.",
    sections: withTitles({
      OBJET_CONTEXTE: { title: "Cadre et déroulement de la visite" },
      OBSERVATIONS: { title: "Interactions observées", required: true },
      EXPRESSION_PARENTS: { required: true },
    }),
  },
  NOTE_SITUATION: {
    type: "NOTE_SITUATION",
    label: "Note de situation",
    description: "Point d'étape sur la situation d'un enfant.",
    toneNote: "Écrit synthétique, daté, faisant apparaître les sources.",
    sections: withTitles({ OBJET_CONTEXTE: { title: "Objet de la note" } }),
  },
  RAPPORT_EDUCATIF: {
    type: "RAPPORT_EDUCATIF",
    label: "Rapport éducatif",
    description: "Rapport éducatif sur l'accompagnement réalisé.",
    toneNote: "Écrit structuré présentant l'accompagnement, l'expression de chacun et les perspectives.",
    sections: withTitles({ ANALYSE: { required: true }, EXPRESSION_PARENTS: { required: true } }),
  },
  RAPPORT_EVOLUTION: {
    type: "RAPPORT_EVOLUTION",
    label: "Rapport d'évolution",
    description: "Évolution de la situation depuis le précédent écrit.",
    toneNote: "Mettre en évidence les évolutions constatées et leurs sources.",
    sections: withTitles({ ELEMENTS_RECUEILLIS: { title: "Évolution de la situation" }, ANALYSE: { required: true } }),
  },
  SYNTHESE: {
    type: "SYNTHESE",
    label: "Synthèse",
    description: "Synthèse de situation à partir des éléments recueillis.",
    toneNote: "Écrit de synthèse : rester fidèle aux éléments sources, sans conclusion non formulée.",
    sections: withTitles({ ANALYSE: { required: true } }),
  },
  EVALUATION_SITUATION: {
    type: "EVALUATION_SITUATION",
    label: "Évaluation de situation",
    description: "Écrit d'évaluation de la situation de l'enfant.",
    toneNote: "L'évaluation reste celle du professionnel : l'outil ne produit aucune appréciation.",
    sections: withTitles({ ANALYSE: { required: true }, EXPRESSION_PARENTS: { required: true }, RESSOURCES: { required: true } }),
  },
  RAPPORT_ASE: {
    type: "RAPPORT_ASE",
    label: "Rapport au responsable ASE",
    description: "Rapport destiné au responsable de l'Aide sociale à l'enfance.",
    defaultRecipient: "Responsable ASE",
    toneNote: "Écrit destiné à l'institution : précis, sourcé, avec propositions explicitement formulées.",
    sections: withTitles({
      ANALYSE: { required: true },
      EXPRESSION_PARENTS: { required: true },
      PROCHAINES_ETAPES: { title: "Propositions et échéances" },
    }),
  },
  RAPPORT_MAGISTRAT: {
    type: "RAPPORT_MAGISTRAT",
    label: "Rapport au magistrat",
    description: "Rapport destiné au juge des enfants.",
    defaultRecipient: "Juge des enfants",
    toneNote: "Écrit destiné à l'autorité judiciaire : chaque élément doit être sourcé et daté.",
    sections: withTitles({
      ANALYSE: { required: true },
      EXPRESSION_PARENTS: { required: true },
      PROCHAINES_ETAPES: { title: "Propositions" },
    }),
  },
  INFORMATION_PREOCCUPANTE: {
    type: "INFORMATION_PREOCCUPANTE",
    label: "Information préoccupante",
    description: "Transmission d'éléments préoccupants à la CRIP.",
    defaultRecipient: "CRIP",
    toneNote:
      "Rapporter les faits et propos au plus près, datés et sourcés, sans qualification juridique ni conclusion non formulée.",
    sections: withTitles(
      {
        OBJET_CONTEXTE: { title: "Circonstances du recueil des informations" },
        ELEMENTS_RECUEILLIS: { title: "Faits rapportés", required: true },
        VIGILANCE: { title: "Éléments de préoccupation", required: true },
        PROCHAINES_ETAPES: { title: "Suites données et information des représentants légaux" },
      },
      ["ANALYSE"],
    ),
  },
};

export function getTemplate(type: DocumentTypeKey): DocumentTemplate {
  return DOCUMENT_TEMPLATES[type];
}

export const DOCUMENT_TYPE_OPTIONS = DOCUMENT_TYPES.map((t) => ({ value: t, label: DOCUMENT_TEMPLATES[t].label }));
