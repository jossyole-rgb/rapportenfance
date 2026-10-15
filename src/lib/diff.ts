/**
 * Comparaison mot à mot entre deux textes (plus longue sous-séquence commune).
 * Code pur, sans dépendance : utilisé pour comparer deux versions d'un écrit.
 */

export type DiffPart = { type: "same" | "added" | "removed"; text: string };

/** Découpe en mots en conservant les espaces et retours à la ligne comme jetons. */
export function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/** Au-delà, la comparaison fine serait trop coûteuse : on compare ligne par ligne. */
const MAX_CELLS = 4_000_000;

function lcsDiff<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): Array<{ type: DiffPart["type"]; item: T }> {
  // préfixe et suffixe communs retirés pour réduire la taille de la table
  let start = 0;
  while (start < a.length && start < b.length && eq(a[start]!, b[start]!)) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && eq(a[endA - 1]!, b[endB - 1]!)) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  const out: Array<{ type: DiffPart["type"]; item: T }> = a.slice(0, start).map((item) => ({ type: "same" as const, item }));
  if ((n + 1) * (m + 1) > MAX_CELLS) {
    for (const item of midA) out.push({ type: "removed", item });
    for (const item of midB) out.push({ type: "added", item });
  } else {
    const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i]![j] = eq(midA[i]!, midB[j]!) ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (eq(midA[i]!, midB[j]!)) {
        out.push({ type: "same", item: midA[i]! });
        i++;
        j++;
      } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
        out.push({ type: "removed", item: midA[i++]! });
      } else {
        out.push({ type: "added", item: midB[j++]! });
      }
    }
    while (i < n) out.push({ type: "removed", item: midA[i++]! });
    while (j < m) out.push({ type: "added", item: midB[j++]! });
  }
  for (const item of a.slice(endA)) out.push({ type: "same", item });
  return out;
}

/** Différences mot à mot, fusionnées en segments contigus de même type. */
export function diffWords(before: string, after: string): DiffPart[] {
  const parts: DiffPart[] = [];
  for (const { type, item } of lcsDiff(tokenize(before), tokenize(after), (x, y) => x === y)) {
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.text += item;
    else parts.push({ type, text: item });
  }
  return parts;
}

export type SectionLike = { key: string; title: string; text: string };
export type SectionDiff = {
  key: string;
  title: string;
  status: "unchanged" | "modified" | "added" | "removed";
  parts: DiffPart[];
};

/** Compare deux versions rubrique par rubrique (rubriques appariées par clé). */
export function diffSections(before: SectionLike[], after: SectionLike[]): SectionDiff[] {
  const byKeyBefore = new Map(before.map((s) => [s.key, s]));
  const keys = [...after.map((s) => s.key), ...before.filter((s) => !after.some((a) => a.key === s.key)).map((s) => s.key)];
  return keys.map((key) => {
    const a = byKeyBefore.get(key);
    const b = after.find((s) => s.key === key);
    const textA = a?.text.trim() ?? "";
    const textB = b?.text.trim() ?? "";
    const title = b?.title ?? a?.title ?? key;
    if (textA === textB) return { key, title, status: "unchanged", parts: textA ? [{ type: "same", text: textA }] : [] };
    if (!textA) return { key, title, status: "added", parts: [{ type: "added", text: textB }] };
    if (!textB) return { key, title, status: "removed", parts: [{ type: "removed", text: textA }] };
    return { key, title, status: "modified", parts: diffWords(textA, textB) };
  });
}

export function diffStats(diffs: SectionDiff[]) {
  let added = 0;
  let removed = 0;
  for (const d of diffs) {
    for (const p of d.parts) {
      const words = p.text.split(/\s+/).filter(Boolean).length;
      if (p.type === "added") added += words;
      if (p.type === "removed") removed += words;
    }
  }
  return { added, removed, changedSections: diffs.filter((d) => d.status !== "unchanged").length };
}
