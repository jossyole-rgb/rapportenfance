import { describe, expect, it } from "vitest";
import { diffSections, diffStats, diffWords } from "@/lib/diff";

const join = (parts: { type: string; text: string }[], keep: string[]) => parts.filter((p) => keep.includes(p.type)).map((p) => p.text).join("");

describe("comparaison de versions", () => {
  it("reconstruit exactement les deux textes", () => {
    const a = "La mère explique : école difficile depuis la rentrée.\nLogement propre.";
    const b = "La mère explique que l'école est difficile depuis la rentrée.\nLe logement est propre.\nÀ prévoir : appeler l'école.";
    const parts = diffWords(a, b);
    expect(join(parts, ["same", "removed"])).toBe(a);
    expect(join(parts, ["same", "added"])).toBe(b);
    expect(parts.some((p) => p.type === "added" && p.text.includes("appeler"))).toBe(true);
  });

  it("textes identiques : aucune différence", () => {
    expect(diffWords("Lucas dit : bien.", "Lucas dit : bien.")).toEqual([{ type: "same", text: "Lucas dit : bien." }]);
  });

  it("apparie les rubriques par clé et qualifie chaque changement", () => {
    const before = [
      { key: "A", title: "Contexte", text: "Visite à domicile." },
      { key: "B", title: "Observations", text: "Logement propre." },
      { key: "C", title: "Analyse", text: "À supprimer." },
    ];
    const after = [
      { key: "A", title: "Contexte", text: "Visite à domicile." },
      { key: "B", title: "Observations", text: "Le logement est propre." },
      { key: "D", title: "Préconisations", text: "Rencontrer l'école." },
    ];
    const d = diffSections(before, after);
    expect(d.map((s) => [s.key, s.status])).toEqual([["A", "unchanged"], ["B", "modified"], ["D", "added"], ["C", "removed"]]);
    expect(diffStats(d)).toMatchObject({ changedSections: 3 });
  });

  it("reste exact sur un long texte", () => {
    const a = Array.from({ length: 1500 }, (_, i) => `mot${i}`).join(" ");
    const b = a.replace("mot700", "MODIFIÉ");
    const parts = diffWords(a, b);
    expect(join(parts, ["same", "removed"])).toBe(a);
    expect(join(parts, ["same", "added"])).toBe(b);
    expect(parts.filter((p) => p.type !== "same")).toEqual([{ type: "removed", text: "mot700" }, { type: "added", text: "MODIFIÉ" }]);
  });
});
