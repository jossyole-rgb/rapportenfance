/** Catégories d'information distinguées par le moteur (cahier des charges, § 7.2). */
export const CATEGORIES = [
  "FAIT",
  "OBSERVATION",
  "PROPOS_ENFANT",
  "PROPOS_PARENT",
  "TIERS",
  "ANALYSE",
  "HYPOTHESE",
  "RESSOURCE",
  "VIGILANCE",
  "ACTION_REALISEE",
  "ACTION_PREVUE",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  FAIT: "Fait rapporté",
  OBSERVATION: "Observation directe",
  PROPOS_ENFANT: "Propos de l'enfant",
  PROPOS_PARENT: "Propos des représentants légaux",
  TIERS: "Information de tiers",
  ANALYSE: "Analyse professionnelle",
  HYPOTHESE: "Hypothèse",
  RESSOURCE: "Ressource / élément favorable",
  VIGILANCE: "Point de vigilance",
  ACTION_REALISEE: "Action réalisée",
  ACTION_PREVUE: "Action prévue",
};

export const SECTION_KEYS = [
  "INFOS_GENERALES",
  "OBJET_CONTEXTE",
  "ELEMENTS_RECUEILLIS",
  "EXPRESSION_ENFANT",
  "EXPRESSION_PARENTS",
  "TIERS",
  "OBSERVATIONS",
  "ANALYSE",
  "VIGILANCE",
  "RESSOURCES",
  "ACTIONS",
  "PROCHAINES_ETAPES",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

/** Rubrique de destination de chaque catégorie. */
export const CATEGORY_SECTION: Record<Category, SectionKey> = {
  FAIT: "ELEMENTS_RECUEILLIS",
  OBSERVATION: "OBSERVATIONS",
  PROPOS_ENFANT: "EXPRESSION_ENFANT",
  PROPOS_PARENT: "EXPRESSION_PARENTS",
  TIERS: "TIERS",
  ANALYSE: "ANALYSE",
  HYPOTHESE: "ANALYSE",
  RESSOURCE: "RESSOURCES",
  VIGILANCE: "VIGILANCE",
  ACTION_REALISEE: "ACTIONS",
  ACTION_PREVUE: "PROCHAINES_ETAPES",
};
