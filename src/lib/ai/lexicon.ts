import type { Actor } from "./types";
import { normalize } from "./text";

/**
 * Lexique métier utilisé par le moteur local et par le vérificateur.
 * Toutes les expressions sont écrites en forme normalisée (minuscules, sans accents).
 */

const CHILD_WORDS = ["l'enfant", "enfant", "le jeune", "la jeune", "le mineur", "la mineure", "l'adolescent", "l'adolescente", "adolescent", "adolescente", "son fils", "sa fille", "le fils", "la fille", "fils", "fille"];

const PARENT_PATTERNS: Array<[RegExp, string]> = [
  [/^(la )?(mere|maman)\b/, "la mère"],
  [/^(le )?(pere|papa)\b/, "le père"],
  [/^(les )?parents\b/, "les parents"],
  [/^(le |la )?(beau-pere|belle-mere)\b/, "le beau-parent"],
  [/^(madame|mme)\s+[a-z-]+/, "Madame"],
  [/^(monsieur|m\.)\s+[a-z-]+/, "Monsieur"],
];

const THIRD_PARTY_PATTERNS: Array<[RegExp, string]> = [
  [/^(l'|le |la )?(ecole|college|lycee|etablissement scolaire)\b/, "l'école"],
  [/^(le |la |l')?(professeure?|prof|enseignante?|maitresse|instituteur|institutrice|directeur|directrice|cpe)\b/, "l'équipe enseignante"],
  [/^(le |la )?(medecin|pediatre|infirmiere?|psychologue|psy|orthophoniste|psychiatre)\b/, "un professionnel de santé"],
  [/^(la )?(pmi|cmp|cmpp|camsp|mdph)\b/, "un service partenaire"],
  [/^(le |la )?(voisine?|voisins)\b/, "le voisinage"],
  [/^(la |le )?(grand-mere|grand-pere|grands-parents|mamie|papi|oncle|tante|cousine?)\b/, "un membre de la famille élargie"],
  [/^(le |la |l')?(club|entraineur|entraineuse|animateur|animatrice|centre de loisirs)\b/, "le club ou centre de loisirs"],
  [/^(l'|la |le )?(assistante? familiale?|famille d'accueil)\b/, "l'assistant(e) familial(e)"],
  [/^(la )?(police|gendarmerie)\b/, "les forces de l'ordre"],
  [/^(l')?(avocate?)\b/, "l'avocat"],
];

const PROFESSIONAL_PATTERNS = [/^(je|j'|nous|on)\b/, /^(l'educat(eur|rice)|l'assistante? sociale?|la referente?|le referent)\b/];

/** Verbes de parole ou d'expression qui signalent un propos rapporté. */
const SPEECH_LIST =
  "dit|disent|dire|a dit|ont dit|explique|expliquent|declare|declarent|raconte|racontent|indique|indiquent|rapporte|rapportent|precise|precisent|exprime|expriment|confie|evoque|evoquent|demande|demandent|souhaite|souhaitent|affirme|affirment|signale|signalent|mentionne|ajoute|repond|refuse|refusent|veut|veulent|voudrait|aimerait|aimeraient|se plaint|se plaignent|pense|pensent|estime|estiment|trouve|trouvent|reconnait|reconnaissent|nie|nient|admet|parle|parlent|dit que|craint|craignent|regrette|accepte|acceptent|informe|alerte|interpelle|appelle pour dire";
export const SPEECH_VERBS = new RegExp(`\\b(?:${SPEECH_LIST})\\b`);
export const SPEECH_VERB_START = new RegExp(`^(?:${SPEECH_LIST})\\b`);

export const HEDGES = /\b(peut-etre|probablement|hypothese|il est possible|pourrait|pourraient|semblerait|il semble|semble|vraisemblablement|sans doute|a confirmer|a verifier)\b/;

export const ANALYSIS_MARKERS = /^(analyse\s*:|evaluation\s*:|a mon sens|selon moi|je pense|j'estime|nous pensons|nous estimons|il me semble|il nous semble|mon analyse|notre analyse|de notre point de vue|de mon point de vue)/;

export const OBSERVATION_MARKERS = /^(observation\s*:|j'observe|je constate|nous observons|nous constatons|on observe|on constate|constat\s*:)/;

const DONE_ACTION = /^(j'ai|nous avons|on a)\s+(appele|contacte|rencontre|transmis|envoye|oriente|accompagne|informe|reçu|recu|telephone|ecrit|propose|fait|organise|sollicite|saisi|alerte|rappele|explique)|\b(a ete|ont ete)\s+(oriente|orientee|contacte|contactee|informe|informee|transmis|transmise|signale|signalee|accompagne|accompagnee|recu|recue)\b|^(action realisee|fait)\s*:/;

const PLANNED_START =
  /^(appeler|rappeler|contacter|recontacter|prevoir|organiser|rencontrer|revoir|envoyer|transmettre|orienter|solliciter|proposer|accompagner|verifier|faire|prendre|inscrire|saisir|informer|programmer|planifier|convoquer|relancer|demander|preparer|rediger|fixer|reprendre|poursuivre|mettre en place|travailler|aider)\b/;

const PLANNED_ANYWHERE =
  /\b(a faire|a prevoir|a programmer|a organiser|prochain|prochaine|prevu|prevue|prevus|prevues|sera|seront|va etre|vont etre|doit etre|devra|devront|todo|suite a donner|echeance)\b|^(action|actions|a faire|suite|suites|prochaines? etapes?)\s*:/;

const VIGILANCE_EXPLICIT = /^(vigilance|point de vigilance|points de vigilance|inquietude|inquietudes|preoccupation|alerte|danger)\s*:/;
const RESOURCE_EXPLICIT = /^(ressource|ressources|point positif|points positifs|element favorable|elements favorables|appui|appuis)\s*:/;
const HYPOTHESIS_EXPLICIT = /^(hypothese|hypotheses|piste|pistes)\s*:/;

export const VIGILANCE_WORDS =
  /\b(crie|crient|cris|hurle|frappe|frappee|coups?|gifle|gifles|violence|violences|violent|violente|marques?|bleus?|hematome|blessure|peur|pleure|pleurs|inquiet|inquiete|inquietude|danger|alcool|alcoolise|drogue|cannabis|absenteisme|absences|descolaris|fugue|fugues|menace|menaces|insulte|insultes|enferme|harcelement|suicid|scarification|automutilation|sexuel|sexuelle|attouchement|maltrait|negligence|faim|isole|isolee|ne veut pas parler|refuse de parler|ne mange pas|dort mal|cauchemar)/;

export const RESOURCE_WORDS =
  /\b(soutien|soutient|aide|aidant|investi|investie|implique|impliquee|propre|chambre individuelle|club|activite|sport|foot|loisirs?|reussit|reussite|progres|progresse|bonne relation|complicite|attentif|attentive|chaleureu|rassurant|disponible|amis|copains|motive|motivee|grand-mere|grands-parents|accueillant)/;

export const SCHOOL_WORDS = /\b(ecole|scolaire|scolarite|college|lycee|classe|professeur|prof|maitresse|enseignant|notes?|bulletin|devoirs|cantine|cpe|absences?)\b/;
export const HEALTH_WORDS = /\b(medecin|pediatre|sante|malade|maladie|traitement|medicament|hopital|urgences|vaccin|psychologue|orthophon|soins?)\b/;

export const OBSERVATION_WORDS =
  /\b(logement|appartement|maison|chambre|propre|proprete|range|rangee|encombre|encombree|odeur|calme|agite|agitee|souriant|souriante|souriait|pleure|joue|jouait|tenue|hygiene|present|presente|presents|absent|absente|arrive|arrivee|vetu|vetue|accueille|accueil|refrigerateur|frigo|lit|salon|cuisine|regard|silencieux|silencieuse|endormi|tremble|s'est assis|s'est assise)\b/;

/** Termes d'appréciation qui ne doivent pas apparaître dans le rapport s'ils ne figurent pas dans les notes. */
export const EVALUATIVE_TERMS = [
  "securisant", "securisante", "insecurisant", "insecurisante", "adapte", "adaptee", "inadapte", "inadaptee", "carence", "carences", "carence affective",
  "defaillant", "defaillante", "defaillance", "maltraitance", "maltraitant", "maltraitante", "danger", "negligence", "negligent", "negligente", "toxique",
  "fusionnel", "fusionnelle", "ambivalent", "ambivalente", "pathologique", "traumatisme", "traumatise", "traumatisee", "attachement", "manipulateur",
  "manipulatrice", "instable", "immature", "bienveillant", "bienveillante", "harmonieux", "harmonieuse", "conflictuel", "conflictuelle", "epanoui",
  "epanouie", "apparait", "semble", "manifestement", "visiblement", "clairement", "evidemment", "toujours", "jamais", "grave", "graves", "inquietant",
  "inquietante", "preoccupant", "preoccupante", "rassurant", "rassurante", "deficient", "deficiente", "dysfonctionnel", "dysfonctionnement",
];

/** Termes à caractère diagnostique : jamais produits sans figurer dans les notes. */
export const DIAGNOSTIC_TERMS = [
  "tdah", "hyperactif", "hyperactive", "hyperactivite", "autisme", "autiste", "tsa", "depression", "depressif", "depressive", "bipolaire", "schizophrene",
  "schizophrenie", "psychose", "psychotique", "trouble", "troubles", "handicap", "deficience", "retard mental", "anorexie", "boulimie", "addiction",
  "alcoolique", "toxicomane", "pervers", "perverse", "borderline", "paranoia", "paranoiaque",
];

/** Jugements de valeur à signaler lors du contrôle qualité. */
export const VALUE_JUDGMENTS = [
  "mauvaise mere", "mauvais pere", "mauvais parent", "mauvais parents", "irresponsable", "laxiste", "incapable", "hysterique", "sale", "fainéant",
  "faineant", "menteur", "menteuse", "manipulateur", "manipulatrice", "nul", "nulle", "bizarre", "etrange", "anormal", "anormale", "caractériel",
  "caracteriel", "capricieux", "capricieuse", "pervers", "toxique", "demissionnaire", "defaillant", "defaillante", "inconscient", "inconsciente",
];

/** end : position (dans le texte d'origine, espaces normalisés) de la fin de la mention de l'auteur. */
export type ActorMatch = { actor: Actor; label?: string; end: number };

/** Repère l'auteur d'un propos en début de phrase. Le texte doit avoir ses espaces normalisés. */
export function detectLeadingActor(sentence: string, childAlias?: string | null): ActorMatch {
  const full = normalize(sentence);
  const prefix = /^(selon|d'apres)\s+/.exec(full);
  const offset = prefix ? prefix[0].length : 0;
  const n = full.slice(offset);
  const alias = childAlias ? normalize(childAlias) : null;
  if (alias && alias.length >= 2) {
    const aliasRe = new RegExp(`^${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (aliasRe.test(n)) return { actor: "CHILD", label: childAlias!.trim(), end: offset + alias.length };
  }
  for (const w of CHILD_WORDS) {
    if (n.startsWith(w + " ") || n === w) return { actor: "CHILD", label: "l'enfant", end: offset + w.length };
  }
  for (const [re, label] of PARENT_PATTERNS) {
    const m = re.exec(n);
    if (m) return { actor: "PARENT", label, end: offset + m[0].length };
  }
  for (const [re, label] of THIRD_PARTY_PATTERNS) {
    const m = re.exec(n);
    if (m) return { actor: "THIRD_PARTY", label, end: offset + m[0].length };
  }
  for (const re of PROFESSIONAL_PATTERNS) {
    const m = re.exec(n);
    if (m) return { actor: "PROFESSIONAL", label: "le professionnel", end: offset + m[0].length };
  }
  return { actor: "NONE", end: 0 };
}

export const lexicon = {
  DONE_ACTION,
  PLANNED_START,
  PLANNED_ANYWHERE,
  VIGILANCE_EXPLICIT,
  RESOURCE_EXPLICIT,
  HYPOTHESIS_EXPLICIT,
};
