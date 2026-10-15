/**
 * Outils de traitement du texte français (sans dépendance, utilisables côté serveur et navigateur).
 */

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Minuscules, sans accents, apostrophes et guillemets typographiques unifiés. */
export function normalize(s: string): string {
  return stripAccents(s)
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[’`´]/g, "'")
    .replace(/[«»“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Frontières de mot compatibles avec les lettres accentuées (\b ne gère que l'ASCII)
const word = (alternatives: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, "giu");

/** Abréviations fréquentes dans les notes de terrain (appliquées aux notes ET au rapport). */
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [word("rdv"), "rendez-vous"],
  [word("vad"), "visite à domicile"],
  [word("t[ée]l\\.?"), "téléphone"],
  [word("pbs?"), "problème"],
  [word("bcp"), "beaucoup"],
  [word("tjr?s"), "toujours"],
  [word("ds"), "dans"],
  [word("qd"), "quand"],
  [word("pr"), "pour"],
  [word("avc"), "avec"],
];

export function expandAbbreviations(s: string): string {
  let out = s;
  for (const [re, rep] of ABBREVIATIONS) out = out.replace(re, rep);
  // "+" et "&" utilisés comme conjonction entre deux mots
  out = out.replace(/\s*\+\s*/g, " et ").replace(/\s&\s/g, " et ");
  return out.replace(/\s{2,}/g, " ").trim();
}

const STOPWORDS = new Set(
  (
    "a au aux avec ce ces cet cette c ca d dans de des du elle elles en et eu il ils j je l la le les leur leurs lui m ma mais me meme mes moi mon n ne nos notre nous on ou par pas pour qu que qui s sa se ses si son sur t ta te tes toi ton tu un une vos votre vous y " +
    "est sont etait etaient ete etre a avait avaient ont as ai avons avez fait faire plus tres aussi alors donc ainsi lors selon vers chez sans sous entre depuis comme dont cela ceci tout tous toute toutes bien encore deja apres avant pendant puis quand " +
    "indique explique dit precise rapporte declare evoque mentionne ajoute signale prevoir"
  ).split(" "),
);

/** Synonymes ramenés à une forme canonique pour le rapprochement notes / rapport. */
const SYNONYMS: Record<string, string> = {
  maman: "mere",
  papa: "pere",
  mineur: "enfant",
  mineure: "enfant",
  fils: "enfant",
  fille: "enfant",
  jeune: "enfant",
  scolaire: "ecole",
  scolarite: "ecole",
  college: "ecole",
  classe: "ecole",
  enseignant: "professeur",
  enseignante: "professeur",
  prof: "professeur",
  maitresse: "professeur",
  maitre: "professeur",
  instituteur: "professeur",
  institutrice: "professeur",
  telephoner: "appeler",
  appel: "appeler",
  contacter: "appeler",
  football: "foot",
  appartement: "logement",
  maison: "logement",
};

/** Racinisation légère du français (suffixes flexionnels courants). */
export function stem(token: string): string {
  let t = token;
  if (t.length <= 3) return t;
  for (const suf of ["issements", "issement", "ements", "ement", "ments", "ment"]) {
    if (t.length - suf.length >= 4 && t.endsWith(suf)) return t.slice(0, -suf.length);
  }
  for (const suf of ["aient", "ait", "ees", "ee", "es", "ez", "er", "s", "x", "e"]) {
    if (t.length - suf.length >= 4 && t.endsWith(suf)) {
      t = t.slice(0, -suf.length);
      break;
    }
  }
  return t;
}

export function rawTokens(s: string): string[] {
  return normalize(expandAbbreviations(s))
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Jetons porteurs de sens (hors mots-outils), canonisés et racinisés. */
export function contentTokens(s: string, extraSynonyms: Record<string, string> = {}): string[] {
  const out: string[] = [];
  for (const raw of rawTokens(s)) {
    if (STOPWORDS.has(raw)) continue;
    if (raw.length < 2 && !/\d/.test(raw)) continue;
    const canon = extraSynonyms[raw] ?? SYNONYMS[raw] ?? raw;
    out.push(/\d/.test(canon) ? canon : stem(canon));
  }
  return out;
}

/** Nombres et dates présents dans un texte (pour vérifier qu'ils figurent dans les notes). */
export function numericTokens(s: string): string[] {
  return (normalize(s).match(/\d+/g) ?? []).map((n) => String(parseInt(n, 10)));
}

/** Passages entre guillemets (citations directes). */
export function quotedPassages(s: string): string[] {
  const out: string[] = [];
  const re = /[«"“]\s*([^«»"“”]{3,}?)\s*[»"”]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) if (m[1]) out.push(m[1]);
  return out;
}

/** Hachage FNV-1a 32 bits (identifiant stable d'une affirmation, non cryptographique). */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function ensureFinalPunctuation(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return /[.!?…:»"]$/.test(t) ? t : t + ".";
}

/** Découpe un texte en phrases (par ligne puis par ponctuation forte) en conservant les positions. */
export function splitSentences(text: string): Array<{ text: string; start: number; end: number }> {
  const out: Array<{ text: string; start: number; end: number }> = [];
  const push = (from: number, to: number) => {
    let a = from;
    let b = to;
    while (a < b && /[\s\-*•–]/.test(text[a]!)) a++;
    const numbered = /^\d+[).]\s+/.exec(text.slice(a, b));
    if (numbered) a += numbered[0].length;
    while (b > a && /[\s;]/.test(text[b - 1]!)) b--;
    if (b > a && /[\p{L}\p{N}]/u.test(text.slice(a, b))) out.push({ text: text.slice(a, b), start: a, end: b });
  };
  let lineStart = 0;
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (i === text.length || ch === "\n") {
      push(lineStart, i);
      lineStart = i + 1;
      continue;
    }
    if (ch === "." || ch === "!" || ch === "?" || ch === ";") {
      const next = text[i + 1];
      if (next !== undefined && !/\s/.test(next)) continue; // 12.10, a.b
      const before = text.slice(Math.max(lineStart, i - 3), i);
      if (ch === "." && /(^|\s)(M|Mme|Mr|Dr|St)$/.test(before)) continue; // M. Dupont
      let j = i;
      while (j + 1 < text.length && /[.!?;]/.test(text[j + 1]!)) j++;
      push(lineStart, ch === ";" ? i : j + 1);
      lineStart = j + 1;
      i = j;
    }
  }
  return out;
}
