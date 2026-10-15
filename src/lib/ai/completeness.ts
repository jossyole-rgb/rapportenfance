import type { SectionKey } from "@/lib/domain/categories";
import type { DocumentTypeKey } from "@/lib/domain/document-types";
import { SCHOOL_WORDS, VALUE_JUDGMENTS, SPEECH_VERBS, detectLeadingActor, EVALUATIVE_TERMS } from "./lexicon";
import { normalize, splitSentences } from "./text";
import { PLACEHOLDER_PREFIX, type Analysis, type CompletenessAlert, type ReportContent, type VerifiedClaim } from "./types";
import { summarize } from "./verifier";

/**
 * Assistant de complétude « Qu'est-ce qui manque à mon rapport ? » (§ 10) et contrôle qualité (§ 11).
 * Ces contrôles signalent des manques : ils ne proposent jamais de contenu à la place du professionnel.
 */

export type CompletenessInput = {
  documentType: DocumentTypeKey;
  content: ReportContent;
  analysis: Analysis | null;
  form: { meetingTime?: string | null; meetingLocation?: string | null; attendees?: string | null; purpose?: string | null };
};

const sectionText = (content: ReportContent, key: SectionKey) =>
  content.sections.find((s) => s.key === key)?.text.trim() ?? "";

const hasRealContent = (text: string) =>
  splitSentences(text).some((s) => !s.text.startsWith(PLACEHOLDER_PREFIX));

const DATE_OR_DEADLINE =
  /\b(\d{1,2}\/\d{1,2}(\/\d{2,4})?|\d{1,2} (janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|semaine prochaine|mois prochain|d'ici|avant le|echeance|sous \d+ (jours|semaines)|dans \d+ (jours|semaines|mois))\b/;

const INFORMED = /\b(informe|informee|informes|informees|information des (parents|representants)|avise|avisee|prevenu|prevenue|accord|consentement|associe|associes|en presence (de la mere|du pere|des parents))\b/;

const CHILD_NOT_HEARD = /\b(non recueilli|pas pu etre recueilli|n'a pas souhaite|n'etait pas present|absent|absente|endormi|trop jeune|ne s'est pas exprime|non verbal)\b/;

export function completenessAlerts(input: CompletenessInput): CompletenessAlert[] {
  const alerts: CompletenessAlert[] = [];
  const add = (id: string, message: string, sectionKey?: SectionKey, severity: CompletenessAlert["severity"] = "warning") =>
    alerts.push({ id, message, sectionKey, severity });
  const { content, documentType } = input;
  const all = normalize(content.sections.map((s) => s.text).join("\n"));
  const has = (k: SectionKey) => content.sections.some((s) => s.key === k);

  // Rubriques obligatoires non renseignées
  for (const s of content.sections) {
    if (s.required && !hasRealContent(s.text)) {
      add(`required-${s.key}`, `La rubrique obligatoire « ${s.title} » n'est pas renseignée.`, s.key);
    }
  }

  // Expression de l'enfant
  if (has("EXPRESSION_ENFANT")) {
    const child = sectionText(content, "EXPRESSION_ENFANT");
    if (!hasRealContent(child) && !CHILD_NOT_HEARD.test(all)) {
      add(
        "child-expression",
        "La position ou l'expression de l'enfant n'est pas renseignée, et le document n'indique pas pourquoi elle n'a pas été recueillie.",
        "EXPRESSION_ENFANT",
      );
    }
  }

  // Expression des représentants légaux pour les écrits à destination d'une autorité
  if (["RAPPORT_MAGISTRAT", "RAPPORT_ASE", "EVALUATION_SITUATION", "RAPPORT_EDUCATIF"].includes(documentType)) {
    if (!hasRealContent(sectionText(content, "EXPRESSION_PARENTS"))) {
      add("parents-expression", "L'expression des représentants légaux n'est pas renseignée.", "EXPRESSION_PARENTS");
    }
  }

  // Informations scolaires ou de santé sans source
  if (input.analysis) {
    for (const item of input.analysis.items.filter((i) => i.flags.includes("SOURCE_NON_PRECISEE"))) {
      const seg = input.analysis.segments.find((s) => s.id === item.segmentId);
      if (!seg) continue;
      const kind = item.flags.includes("INFO_SCOLAIRE") ? "scolaire" : "de santé";
      add(`source-${item.id}`, `La source d'une information ${kind} n'est pas précisée : « ${seg.text.slice(0, 80)} ».`, "ELEMENTS_RECUEILLIS");
    }
  } else if (SCHOOL_WORDS.test(normalize(sectionText(content, "ELEMENTS_RECUEILLIS")))) {
    add("source-school", "Vérifiez que la source des informations scolaires est précisée.", "ELEMENTS_RECUEILLIS", "info");
  }

  // Prochaines étapes et échéances
  const next = sectionText(content, "PROCHAINES_ETAPES");
  if (has("PROCHAINES_ETAPES")) {
    if (!hasRealContent(next)) add("no-next-steps", "Aucune prochaine étape n'est indiquée.", "PROCHAINES_ETAPES");
    else if (!DATE_OR_DEADLINE.test(normalize(next))) add("no-deadline", "Aucune échéance n'est indiquée pour les prochaines étapes.", "PROCHAINES_ETAPES");
  }

  // Information des représentants légaux sur les actions envisagées
  if (hasRealContent(next) && !INFORMED.test(all)) {
    add(
      "parents-informed",
      "Il n'est pas précisé si les représentants légaux ont été informés des actions envisagées.",
      "PROCHAINES_ETAPES",
    );
  }

  // Informations du rendez-vous
  if (!input.form.meetingLocation) add("form-location", "Le lieu du rendez-vous n'est pas renseigné.", "INFOS_GENERALES");
  if (!input.form.attendees) add("form-attendees", "Les personnes présentes ne sont pas renseignées.", "INFOS_GENERALES");
  if (!input.form.purpose) add("form-purpose", "L'objet du rendez-vous n'est pas renseigné.", "OBJET_CONTEXTE");
  if (!input.form.meetingTime) add("form-time", "L'heure du rendez-vous n'est pas renseignée.", "INFOS_GENERALES", "info");

  // Spécificités de l'information préoccupante
  if (documentType === "INFORMATION_PREOCCUPANTE") {
    const facts = sectionText(content, "ELEMENTS_RECUEILLIS") + "\n" + sectionText(content, "VIGILANCE");
    if (!DATE_OR_DEADLINE.test(normalize(facts))) {
      add("ip-dates", "Les faits rapportés ne sont pas datés (date ou période des faits).", "ELEMENTS_RECUEILLIS");
    }
  }

  // Passages « à compléter » restants
  for (const s of content.sections) {
    if (s.text.includes(PLACEHOLDER_PREFIX) && !(s.required && !hasRealContent(s.text))) {
      add(`placeholder-${s.key}`, `La rubrique « ${s.title} » contient un passage « à compléter ».`, s.key, "info");
    }
  }
  return alerts;
}

export type QualityCheck = {
  id: string;
  label: string;
  status: "ok" | "warning";
  details: string[];
};

/** Contrôles automatiques présentés dans la checklist qualité (§ 11). */
export function qualityChecks(input: CompletenessInput, claims: VerifiedClaim[], childAlias?: string | null): QualityCheck[] {
  const { content } = input;
  const alerts = completenessAlerts(input);
  const checks: QualityCheck[] = [];
  const push = (id: string, label: string, details: string[]) =>
    checks.push({ id, label, status: details.length ? "warning" : "ok", details });

  // Objectivité : jugements de valeur
  const judgments: string[] = [];
  for (const s of content.sections) {
    const n = normalize(s.text);
    for (const term of VALUE_JUDGMENTS) {
      if (new RegExp(`(^|[^a-z])${term}([^a-z]|$)`).test(n)) judgments.push(`« ${term} » (rubrique ${s.title})`);
    }
  }
  push("objectivity", "Objectivité de la rédaction et absence de jugements de valeur", [...new Set(judgments)]);

  // Distinction faits / interprétations
  const interpretive: string[] = [];
  for (const key of ["ELEMENTS_RECUEILLIS", "OBSERVATIONS"] as SectionKey[]) {
    const s = content.sections.find((x) => x.key === key);
    if (!s) continue;
    for (const sentence of splitSentences(s.text)) {
      const n = normalize(sentence.text);
      const found = EVALUATIVE_TERMS.filter((t) => new RegExp(`(^|[^a-z])${t}([^a-z]|$)`).test(n));
      if (found.length) interpretive.push(`« ${sentence.text.slice(0, 70)} » (${found.join(", ")})`);
    }
  }
  push("facts-vs-interpretation", "Distinction entre faits et interprétations", interpretive);

  // Attribution des propos
  const unattributed: string[] = [];
  for (const key of ["EXPRESSION_ENFANT", "EXPRESSION_PARENTS", "TIERS"] as SectionKey[]) {
    const s = content.sections.find((x) => x.key === key);
    if (!s) continue;
    for (const sentence of splitSentences(s.text)) {
      if (sentence.text.startsWith(PLACEHOLDER_PREFIX)) continue;
      const lead = detectLeadingActor(sentence.text, childAlias);
      if (lead.actor === "NONE" && !SPEECH_VERBS.test(normalize(sentence.text))) {
        unattributed.push(`« ${sentence.text.slice(0, 70)} » (${s.title})`);
      }
    }
  }
  push("attribution", "Attribution des propos à leur source", unattributed);

  push(
    "child-expression",
    "Expression du mineur (lorsque recueillie et pertinente)",
    alerts.filter((a) => a.id === "child-expression").map((a) => a.message),
  );
  push(
    "parents-expression",
    "Expression des représentants légaux (lorsque pertinente)",
    alerts.filter((a) => a.id === "parents-expression").map((a) => a.message),
  );

  // Cohérence chronologique : dates d'actions réalisées postérieures au rendez-vous, échéances antérieures
  push("chronology", "Cohérence chronologique", chronologyIssues(content));

  push(
    "actions",
    "Actions entreprises et prochaines étapes avec échéances",
    alerts.filter((a) => ["no-next-steps", "no-deadline", "parents-informed"].includes(a.id)).map((a) => a.message),
  );
  push(
    "missing",
    "Informations manquantes",
    alerts.filter((a) => a.id.startsWith("form-") || a.id.startsWith("required-") || a.id.startsWith("source-") || a.id === "ip-dates").map((a) => a.message),
  );

  const sum = summarize(claims);
  const unsupported: string[] = [];
  if (sum.redUnacknowledged) unsupported.push(`${sum.redUnacknowledged} affirmation(s) non retrouvée(s) dans les notes et non confirmée(s).`);
  if (sum.orange) unsupported.push(`${sum.orange} passage(s) à vérifier.`);
  push("unsupported", "Affirmations non étayées", unsupported);

  return checks;
}

const DATE_RE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;

function chronologyIssues(content: ReportContent): string[] {
  const issues: string[] = [];
  const general = content.sections.find((s) => s.key === "INFOS_GENERALES")?.text ?? "";
  const meeting = /date\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(general);
  if (!meeting) return issues;
  const meetingTime = Date.UTC(+meeting[3]!, +meeting[2]! - 1, +meeting[1]!);
  const scan = (key: SectionKey, predicate: (t: number) => boolean, message: string) => {
    const text = content.sections.find((s) => s.key === key)?.text ?? "";
    for (const m of text.matchAll(DATE_RE)) {
      const t = Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!);
      if (predicate(t)) issues.push(`${message} (${m[0]}).`);
    }
  };
  scan("ACTIONS", (t) => t > meetingTime, "Action présentée comme réalisée à une date postérieure au rendez-vous");
  scan("PROCHAINES_ETAPES", (t) => t < meetingTime, "Échéance antérieure à la date du rendez-vous");
  return issues;
}

/**
 * Indicateur de qualité rédactionnelle : part des contrôles automatiques sans alerte.
 * Indicatif uniquement. Il ne constitue en aucun cas une mesure de conformité à un référentiel.
 */
export function qualityIndicator(checks: QualityCheck[]): number {
  if (!checks.length) return 0;
  return Math.round((checks.filter((c) => c.status === "ok").length / checks.length) * 100);
}

/** Points de la checklist que le professionnel doit cocher avant de déclarer la relecture terminée. */
export const MANUAL_REVIEW_ITEMS = [
  { id: "objectivity", label: "La rédaction est objective et exempte de jugements de valeur." },
  { id: "facts", label: "Les faits sont distingués des interprétations et des hypothèses." },
  { id: "attribution", label: "Chaque propos est attribué à son auteur ; aucune citation n'a été inventée." },
  { id: "child", label: "L'expression de l'enfant figure lorsqu'elle a été recueillie et qu'elle est pertinente." },
  { id: "parents", label: "L'expression des représentants légaux figure lorsqu'elle est pertinente." },
  { id: "chronology", label: "La chronologie est cohérente." },
  { id: "actions", label: "Les actions entreprises et les prochaines étapes (avec échéances) sont exactes." },
  { id: "missing", label: "Les informations manquantes ont été complétées ou leur absence est assumée." },
  { id: "unsupported", label: "Les passages signalés en orange ou en rouge ont été vérifiés." },
] as const;
