import type { Category } from "@/lib/domain/categories";
import { CATEGORY_SECTION } from "@/lib/domain/categories";
import { getTemplate } from "@/lib/domain/document-types";
import {
  ANALYSIS_MARKERS,
  HEALTH_WORDS,
  HEDGES,
  OBSERVATION_MARKERS,
  OBSERVATION_WORDS,
  RESOURCE_WORDS,
  SCHOOL_WORDS,
  SPEECH_VERBS,
  SPEECH_VERB_START,
  VIGILANCE_WORDS,
  detectLeadingActor,
  lexicon,
} from "./lexicon";
import { capitalize, ensureFinalPunctuation, expandAbbreviations, normalize, splitSentences } from "./text";
import {
  PLACEHOLDER_PREFIX,
  type Analysis,
  type ClassifiedItem,
  type DraftingProvider,
  type EngineInput,
  type ReportSection,
  type SourceSegment,
  type Suggestion,
} from "./types";

/**
 * Moteur local déterministe.
 *
 * Il structure et attribue les notes à l'aide de règles linguistiques explicites, sans reformulation libre :
 * il ne peut donc pas produire d'information absente des notes. Il s'exécute entièrement sur le serveur
 * de l'application et ne transmet aucune donnée à un service tiers.
 * La reformulation rédactionnelle avancée relèvera d'un fournisseur de modèle de langage, une fois celui-ci validé
 * (DPO, AIPD, contrat de sous-traitance) ; il devra implémenter la même interface DraftingProvider.
 */

export const LOCAL_ENGINE_ID = "local-rules-v1";

/** Sources issues du formulaire : utilisées pour la rubrique « Informations générales » et par le vérificateur. */
export function formSegments(input: EngineInput): SourceSegment[] {
  const fields: Array<[string, string | null | undefined]> = [
    ["Dossier", input.caseReference],
    ["Professionnel", [input.authorName, input.authorJobTitle].filter(Boolean).join(", ")],
    ["Service", input.serviceName],
    ["Date", formatDateFr(input.meetingDate)],
    ["Heure", input.meetingTime],
    ["Lieu", input.meetingLocation],
    ["Type d'entretien", input.interviewType],
    ["Personnes présentes", input.attendees],
    ["Objet", input.purpose],
    ["Destinataire", input.recipient],
    ["Prénom de l'enfant", input.childAlias],
  ];
  return fields
    .filter(([, v]) => v && v.trim())
    .map(([label, v], i) => ({ id: `F${i + 1}`, origin: "FORM" as const, label, text: v!.trim(), start: 0, end: v!.trim().length }));
}

/** Éléments sources issus des notes (découpage déterministe, indépendant du fournisseur). */
export function noteSegments(notes: string): SourceSegment[] {
  return splitSentences(notes).map((s, i) => ({ id: `N${i + 1}`, origin: "NOTES" as const, text: s.text, start: s.start, end: s.end }));
}

/** Ensemble des sources utilisées par le vérificateur : formulaire + notes. */
export function buildSourceSegments(input: EngineInput): SourceSegment[] {
  return [...formSegments(input), ...noteSegments(input.notes)];
}

export function formatDateFr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function classify(rawText: string, childAlias?: string | null): Omit<ClassifiedItem, "id" | "segmentId"> {
  const text = expandAbbreviations(rawText).replace(/\s+/g, " ").trim();
  const n = normalize(text);
  const lead = detectLeadingActor(text, childAlias);
  const afterActor = n.slice(lead.end);
  const hasSpeech = SPEECH_VERBS.test(lead.actor === "NONE" ? n : afterActor.slice(0, 60));
  const flags: ClassifiedItem["flags"] = [];
  if (VIGILANCE_WORDS.test(n)) flags.push("MOTS_VIGILANCE");
  if (RESOURCE_WORDS.test(n)) flags.push("MOTS_RESSOURCE");
  if (SCHOOL_WORDS.test(n)) flags.push("INFO_SCOLAIRE");
  if (HEALTH_WORDS.test(n)) flags.push("INFO_SANTE");

  const base = { actor: lead.actor, actorLabel: lead.label, flags };
  const out = (category: Category, confidence: ClassifiedItem["confidence"], rationale: string) => ({
    ...base,
    category,
    confidence,
    rationale,
  });

  // 0. Contexte du rendez-vous (« Visite domicile mère », « Entretien au service »)
  if (/^(visite|vad|entretien|rendez-vous|rencontre|contexte|cadre)\b/.test(n) && n.length < 120 && !hasSpeech) {
    flags.push("CONTEXTE");
    return out("FAIT", "MEDIUM", "Élément de contexte du rendez-vous.");
  }

  // 1. Libellés explicites posés par le professionnel dans ses notes
  if (lexicon.VIGILANCE_EXPLICIT.test(n)) return out("VIGILANCE", "HIGH", "Libellé « vigilance » présent dans les notes.");
  if (lexicon.RESOURCE_EXPLICIT.test(n)) return out("RESSOURCE", "HIGH", "Libellé « ressource » présent dans les notes.");
  if (lexicon.HYPOTHESIS_EXPLICIT.test(n)) return out("HYPOTHESE", "HIGH", "Libellé « hypothèse » présent dans les notes.");
  if (ANALYSIS_MARKERS.test(n)) {
    return HEDGES.test(n)
      ? out("HYPOTHESE", "MEDIUM", "Analyse formulée au conditionnel ou avec une réserve.")
      : out("ANALYSE", "HIGH", "Analyse explicitement formulée par le professionnel.");
  }
  if (OBSERVATION_MARKERS.test(n)) return out("OBSERVATION", "HIGH", "Constat formulé par le professionnel.");

  // 2. Actions
  if (lexicon.DONE_ACTION.test(n)) return out("ACTION_REALISEE", "HIGH", "Action rédigée au passé.");
  if (lexicon.PLANNED_START.test(n) || (lead.actor !== "CHILD" && lead.actor !== "PARENT" && lexicon.PLANNED_ANYWHERE.test(n))) {
    return out("ACTION_PREVUE", lexicon.PLANNED_START.test(n) ? "HIGH" : "MEDIUM", "Action à l'infinitif ou marqueur de suite à donner.");
  }

  // 3. Propos rapportés selon leur auteur
  if (lead.actor === "CHILD" && hasSpeech) return out("PROPOS_ENFANT", "HIGH", `Propos attribué à ${lead.label}.`);
  if (lead.actor === "PARENT" && hasSpeech) return out("PROPOS_PARENT", "HIGH", `Propos attribué à ${lead.label}.`);
  if (lead.actor === "THIRD_PARTY" && hasSpeech) return out("TIERS", "HIGH", `Information transmise par ${lead.label}.`);
  if (lead.actor === "THIRD_PARTY") return out("TIERS", "MEDIUM", `Information concernant ou provenant de ${lead.label} : source à préciser.`);
  if (lead.actor === "PROFESSIONAL") {
    if (HEDGES.test(n)) return out("HYPOTHESE", "MEDIUM", "Formulation du professionnel comportant une réserve.");
    return out("OBSERVATION", "MEDIUM", "Constat rédigé à la première personne.");
  }
  if (HEDGES.test(n)) return out("HYPOTHESE", "MEDIUM", "Formulation au conditionnel ou avec une réserve.");

  // 4. Observations directes et faits
  if (OBSERVATION_WORDS.test(n)) return out("OBSERVATION", "MEDIUM", "Élément descriptif observable (lieu, attitude, présence).");
  if (lead.actor === "CHILD" || lead.actor === "PARENT") {
    return out("OBSERVATION", "LOW", `Élément concernant ${lead.label}, sans propos rapporté identifié.`);
  }
  const unsourced = flags.includes("INFO_SCOLAIRE") || flags.includes("INFO_SANTE");
  if (unsourced) flags.push("SOURCE_NON_PRECISEE");
  return out("FAIT", unsourced ? "LOW" : "MEDIUM", unsourced ? "Information sans source précisée dans les notes." : "Élément factuel non attribué.");
}

/** Mise en forme minimale d'un passage : aucune reformulation du fond, uniquement la ponctuation et l'attribution. */
export function renderItem(segText: string, item: ClassifiedItem, childAlias?: string | null): string {
  const text = expandAbbreviations(segText).replace(/^[-*•–]\s*/, "").replace(/\s+/g, " ").trim();
  const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

  switch (item.category) {
    case "PROPOS_ENFANT":
    case "PROPOS_PARENT":
    case "TIERS": {
      // « Mère explique école difficile » -> « La mère explique : école difficile. »
      const lead = detectLeadingActor(text, childAlias);
      if (lead.actor === "NONE" || !lead.label) return ensureFinalPunctuation(capitalize(text));
      const rest = text.slice(lead.end).trim();
      const verb = SPEECH_VERB_START.exec(normalize(rest));
      if (!verb) return ensureFinalPunctuation(capitalize(text));
      const said = rest.slice(verb[0].length).trim().replace(/^(que |qu')/i, "").replace(/^:\s*/, "");
      if (!said) return ensureFinalPunctuation(capitalize(text));
      const actorText = lead.label === "l'enfant" || lead.actor === "THIRD_PARTY" || lead.actor === "PARENT" ? capitalize(lead.label) : lead.label;
      const verbOut = verb[0] === "dit" || verb[0] === "a dit" ? "indique" : rest.slice(0, verb[0].length).toLowerCase();
      return ensureFinalPunctuation(`${actorText} ${verbOut} : ${said}`);
    }
    case "ACTION_PREVUE": {
      const cleaned = text.replace(/^(actions?|[aà] faire|suites?|prochaines? [ée]tapes?)\s*:\s*/i, "");
      return ensureFinalPunctuation(`À prévoir : ${lowerFirst(cleaned)}`);
    }
    case "HYPOTHESE": {
      const cleaned = text.replace(/^(hypoth[eè]ses?|pistes?)\s*:\s*/i, "");
      return ensureFinalPunctuation(`Hypothèse formulée dans les notes : ${lowerFirst(cleaned)}`);
    }
    case "ANALYSE": {
      const cleaned = text.replace(/^(analyse|[ée]valuation)\s*:\s*/i, "");
      return ensureFinalPunctuation(`Analyse du professionnel : ${lowerFirst(cleaned)}`);
    }
    case "VIGILANCE":
    case "RESSOURCE":
    case "OBSERVATION":
    case "ACTION_REALISEE": {
      const cleaned = text.replace(/^(points? de vigilance|vigilance|inqui[ée]tudes?|pr[ée]occupation|alerte|danger|ressources?|points? positifs?|[ée]l[ée]ments? favorables?|appuis?|observation|constat|action r[ée]alis[ée]e|fait)\s*:\s*/i, "");
      return ensureFinalPunctuation(capitalize(cleaned));
    }
    default:
      return ensureFinalPunctuation(capitalize(text));
  }
}

function placeholder(reason: string) {
  return `${PLACEHOLDER_PREFIX} : ${reason}]`;
}

export class LocalRulesProvider implements DraftingProvider {
  id = LOCAL_ENGINE_ID;
  label = "Moteur local de structuration (règles explicites, sans service tiers)";
  external = false;

  async analyze(input: EngineInput): Promise<Analysis> {
    // Étape 1 : analyse - découpage des notes en éléments sources
    const segments = noteSegments(input.notes);

    // Étapes 2 et 3 : extraction et classification
    const items: ClassifiedItem[] = [];
    const suggestions: Suggestion[] = [];
    for (const seg of segments) {
      const c = classify(seg.text, input.childAlias);
      const item: ClassifiedItem = { id: `I${items.length + 1}`, segmentId: seg.id, ...c };
      items.push(item);
      if (c.flags.includes("MOTS_VIGILANCE") && c.category !== "VIGILANCE") {
        suggestions.push({
          id: `S${suggestions.length + 1}`,
          segmentId: seg.id,
          kind: "VIGILANCE",
          message:
            "Ce passage contient des termes pouvant relever d'un point de vigilance. L'outil ne l'a pas classé comme tel : à apprécier par le professionnel.",
        });
      }
      if (c.flags.includes("MOTS_RESSOURCE") && c.category !== "RESSOURCE") {
        suggestions.push({
          id: `S${suggestions.length + 1}`,
          segmentId: seg.id,
          kind: "RESSOURCE",
          message: "Ce passage pourrait constituer une ressource ou un élément favorable. À apprécier par le professionnel.",
        });
      }
      if (c.confidence === "LOW") {
        suggestions.push({
          id: `S${suggestions.length + 1}`,
          segmentId: seg.id,
          kind: "CLASSIFICATION_INCERTAINE",
          message: `Classement incertain (${c.rationale}) : vérifiez la rubrique choisie.`,
        });
      }
    }
    return {
      engine: this.id,
      engineLabel: this.label,
      generatedAt: new Date().toISOString(),
      segments: [...formSegments(input), ...segments],
      items,
      suggestions,
    };
  }

  // Étape 4 : construction du document selon la trame du type d'écrit
  async compose(input: EngineInput, analysis: Analysis): Promise<ReportSection[]> {
    const template = getTemplate(input.documentType);
    const segById = new Map(analysis.segments.map((s) => [s.id, s]));
    const bySection = new Map<string, string[]>();
    for (const item of analysis.items) {
      const seg = segById.get(item.segmentId);
      if (!seg) continue;
      let key: string = item.flags.includes("CONTEXTE") ? "OBJET_CONTEXTE" : CATEGORY_SECTION[item.category];
      // Rubrique absente de la trame (ex. analyse dans une information préoccupante) : rattachement aux éléments recueillis
      if (!template.sections.some((s) => s.key === key)) key = "ELEMENTS_RECUEILLIS";
      const list = bySection.get(key) ?? [];
      list.push(renderItem(seg.text, item, input.childAlias));
      bySection.set(key, list);
    }

    const general = [
      `Dossier : ${input.caseReference}.`,
      `Date : ${formatDateFr(input.meetingDate)}${input.meetingTime ? ` à ${input.meetingTime}` : ""}.`,
      input.meetingLocation ? `Lieu : ${input.meetingLocation}.` : placeholder("lieu du rendez-vous non renseigné"),
      `Rédacteur : ${[input.authorName, input.authorJobTitle].filter(Boolean).join(", ")}${input.serviceName ? ` (${input.serviceName})` : ""}.`,
      input.attendees ? `Personnes présentes : ${input.attendees}.` : placeholder("personnes présentes non renseignées"),
      input.recipient ? `Destinataire : ${input.recipient}.` : null,
    ].filter(Boolean) as string[];

    const context = [
      input.interviewType ? `Type d'intervention : ${input.interviewType}.` : null,
      input.purpose ? `Objet : ${ensureFinalPunctuation(input.purpose)}` : placeholder("objet du rendez-vous non renseigné"),
    ].filter(Boolean) as string[];

    return template.sections.map((s) => {
      let lines: string[];
      if (s.key === "INFOS_GENERALES") lines = general;
      else if (s.key === "OBJET_CONTEXTE") lines = [...context, ...(bySection.get(s.key) ?? [])];
      else lines = bySection.get(s.key) ?? [];
      if (lines.length === 0 && s.required) lines = [placeholder("aucun élément correspondant dans les notes")];
      return { key: s.key, title: s.title, required: s.required, text: lines.join("\n") };
    });
  }
}
