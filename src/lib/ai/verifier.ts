import type { SectionKey } from "@/lib/domain/categories";
import { DIAGNOSTIC_TERMS, EVALUATIVE_TERMS, detectLeadingActor } from "./lexicon";
import { contentTokens, fnv1a, normalize, numericTokens, quotedPassages, splitSentences, expandAbbreviations } from "./text";
import { PLACEHOLDER_PREFIX, type Acknowledgement, type ReportContent, type SourceSegment, type VerifiedClaim } from "./types";

/**
 * Contrôle anti-hallucination (étapes 5 et 6) : rapproche chaque affirmation du rapport des notes sources.
 *
 * Ce contrôle est indépendant du fournisseur de rédaction et entièrement déterministe. Il repose sur le recouvrement
 * lexical, la présence des citations, dates et nombres dans les sources et la détection de termes d'appréciation ou
 * de diagnostic. C'est une aide à la relecture : il ne garantit en aucun cas l'exactitude du document.
 */

export const VERIFICATION_DISCLAIMER =
  "Contrôle automatisé indicatif : il aide à repérer les passages à vérifier mais ne garantit pas l'exactitude du document. La relecture professionnelle reste indispensable.";

const GREEN_THRESHOLD = 0.75;
const ORANGE_THRESHOLD = 0.45;

// Sections dont le contenu provient du formulaire ou de libellés de structure
const STRUCTURAL_PREFIXES = /^(dossier|date|lieu|redacteur|personnes presentes|destinataire|type d'intervention|objet)\s*:/;

type PreparedSource = { seg: SourceSegment; tokens: Set<string>; norm: string };

export type VerificationContext = {
  segments: SourceSegment[];
  childAlias?: string | null;
};

export function claimHash(text: string): string {
  return fnv1a(normalize(text));
}

function prepare(segments: SourceSegment[]): { sources: PreparedSource[]; allTokens: Set<string>; allNorm: string; numbers: Set<string> } {
  const sources = segments.map((seg) => ({
    seg,
    tokens: new Set(contentTokens(seg.text)),
    norm: normalize(expandAbbreviations(seg.text)),
  }));
  const allTokens = new Set(sources.flatMap((s) => [...s.tokens]));
  const allNorm = sources.map((s) => s.norm).join(" \n ");
  const numbers = new Set(segments.flatMap((s) => numericTokens(s.text)));
  return { sources, allTokens, allNorm, numbers };
}

function containsTerm(normText: string, term: string): boolean {
  return new RegExp(`(^|[^a-z])${term.replace(/[-]/g, "\\-")}([^a-z]|$)`).test(normText);
}

export function verifyClaimText(
  text: string,
  sectionKey: SectionKey,
  prepared: ReturnType<typeof prepare>,
  childAlias?: string | null,
): Omit<VerifiedClaim, "acknowledged"> | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith(PLACEHOLDER_PREFIX)) return null;
  const norm = normalize(expandAbbreviations(trimmed));
  // Les lignes « Libellé : valeur » issues du formulaire sont vérifiées sur leur seule valeur
  const isStructural = STRUCTURAL_PREFIXES.test(norm);
  const verifiable = isStructural ? trimmed.slice(trimmed.indexOf(":") + 1) : trimmed;
  const tokens = contentTokens(verifiable, childAlias ? { [normalize(childAlias)]: "enfant" } : {});
  const id = claimHash(trimmed);
  if (tokens.length === 0) return null;

  const reasons: string[] = [];
  const state: { forced: "RED" | "ORANGE" | null } = { forced: null };
  const escalate = (level: "RED" | "ORANGE", reason: string) => {
    reasons.push(reason);
    if (level === "RED") state.forced = "RED";
    else if (state.forced === null) state.forced = "ORANGE";
  };

  // Rapprochement lexical avec chaque élément source
  const aliasSyn = childAlias ? { [normalize(childAlias)]: "enfant" } : {};
  const sourcesTok = prepared.sources.map((s) => ({
    ...s,
    tokens: childAlias ? new Set(contentTokens(s.seg.text, aliasSyn)) : s.tokens,
  }));
  const ranked = sourcesTok
    .map((s) => ({ s, hit: tokens.filter((t) => s.tokens.has(t)).length }))
    .filter((r) => r.hit > 0)
    .sort((a, b) => b.hit - a.hit);
  const best = ranked[0];
  const single = best ? best.hit / tokens.length : 0;
  const top = ranked.slice(0, 3);
  const unionSet = new Set(top.flatMap((r) => tokens.filter((t) => r.s.tokens.has(t))));
  const union = unionSet.size / tokens.length;
  const score = Math.round(Math.max(single, union * 0.9) * 100) / 100;
  const sourceSegmentIds = top.filter((r) => r.hit / tokens.length >= 0.34 || r === best).map((r) => r.s.seg.id);

  // Citations directes : les mots exacts doivent figurer dans les notes (§ 7.3)
  for (const q of quotedPassages(trimmed)) {
    if (!prepared.allNorm.includes(normalize(q))) {
      escalate("RED", `Citation « ${q.slice(0, 60)} » absente des notes : une citation directe n'est possible que si les mots exacts y figurent.`);
    }
  }

  // Dates et nombres
  const missingNumbers = numericTokens(trimmed).filter((n) => !prepared.numbers.has(n));
  if (missingNumbers.length) escalate("RED", `Date ou nombre non retrouvé dans les sources : ${missingNumbers.join(", ")}.`);

  // Termes de diagnostic
  for (const term of DIAGNOSTIC_TERMS) {
    if (containsTerm(norm, term) && !containsTerm(prepared.allNorm, term)) {
      escalate("RED", `Terme à caractère diagnostique (« ${term} ») absent des notes : l'outil ne doit produire aucun diagnostic.`);
    }
  }

  // Termes d'appréciation non présents dans les notes
  const evaluative = EVALUATIVE_TERMS.filter((t) => containsTerm(norm, t) && !containsTerm(prepared.allNorm, t));
  if (evaluative.length) {
    escalate(
      score < ORANGE_THRESHOLD ? "RED" : "ORANGE",
      `Appréciation absente des notes (${evaluative.map((t) => `« ${t} »`).join(", ")}) : interprétation à vérifier.`,
    );
  }

  // Attribution des propos : l'auteur indiqué doit correspondre à celui des notes
  const claimActor = detectLeadingActor(trimmed, childAlias);
  if (best && (claimActor.actor === "CHILD" || claimActor.actor === "PARENT" || claimActor.actor === "THIRD_PARTY")) {
    const srcActor = detectLeadingActor(best.s.seg.text, childAlias);
    if (srcActor.actor !== "NONE" && srcActor.actor !== claimActor.actor && best.s.seg.origin === "NOTES") {
      escalate("RED", `Propos attribué à « ${claimActor.label} » alors que la note source l'attribue à « ${srcActor.label} ».`);
    } else if (srcActor.actor === claimActor.actor && srcActor.label !== claimActor.label && claimActor.actor === "PARENT") {
      escalate("RED", `Propos attribué à « ${claimActor.label} » alors que la note source l'attribue à « ${srcActor.label} ».`);
    }
  }

  let level: VerifiedClaim["level"];
  if (score >= GREEN_THRESHOLD) level = "GREEN";
  else if (score >= ORANGE_THRESHOLD) level = "ORANGE";
  else level = "RED";

  if (level === "ORANGE") reasons.unshift("Reformulation partiellement retrouvée dans les notes : vérifier la fidélité du passage.");
  if (level === "RED") {
    reasons.unshift(
      isStructural
        ? "Information non retrouvée dans les champs du formulaire."
        : "Information non retrouvée dans les notes ou insuffisamment étayée : à modifier, supprimer ou confirmer.",
    );
  }
  const forced = state.forced;
  if (forced === "RED") level = "RED";
  else if (forced === "ORANGE" && level === "GREEN") level = "ORANGE";
  if (level === "GREEN") reasons.push("Élément identifiable dans les sources.");

  return { id, sectionKey, text: trimmed, level, score, reasons, sourceSegmentIds };
}

/** Vérifie l'ensemble du rapport. Les accusés de vérification sont rattachés par empreinte de texte. */
export function verifyReport(content: ReportContent, ctx: VerificationContext): VerifiedClaim[] {
  const prepared = prepare(ctx.segments);
  const acks = new Map<string, Acknowledgement>(content.acknowledgements.map((a) => [a.claimHash, a]));
  const out: VerifiedClaim[] = [];
  for (const section of content.sections) {
    for (const sentence of splitSentences(section.text)) {
      const claim = verifyClaimText(sentence.text, section.key, prepared, ctx.childAlias);
      if (claim) out.push({ ...claim, acknowledged: acks.get(claim.id) ?? null });
    }
  }
  return out;
}

export type VerificationSummary = { green: number; orange: number; red: number; redUnacknowledged: number; total: number };

export function summarize(claims: VerifiedClaim[]): VerificationSummary {
  const s = { green: 0, orange: 0, red: 0, redUnacknowledged: 0, total: claims.length };
  for (const c of claims) {
    if (c.level === "GREEN") s.green++;
    else if (c.level === "ORANGE") s.orange++;
    else {
      s.red++;
      if (!c.acknowledged) s.redUnacknowledged++;
    }
  }
  return s;
}
