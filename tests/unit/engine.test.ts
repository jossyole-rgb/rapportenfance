import { describe, expect, it } from "vitest";
import { runDraftingPipeline } from "@/lib/ai/pipeline";
import { verifyReport } from "@/lib/ai/verifier";
import type { EngineInput } from "@/lib/ai/types";

const SPEC_NOTES =
  "Visite domicile mère. Enfant présent. Mère explique école difficile depuis rentrée. Lucas dit professeur crie beaucoup. Mère dit père appelle peu. Lucas ne veut pas parler du père. Logement propre. Lucas a une chambre individuelle. Maman demande aide inscription foot. Appeler école + club.";

const input: EngineInput = {
  documentType: "VISITE_DOMICILE",
  notes: SPEC_NOTES,
  childAlias: "Lucas",
  caseReference: "D-2026-0042",
  authorName: "Camille Martin",
  authorJobTitle: "Éducatrice spécialisée",
  serviceName: "Service AEMO",
  meetingDate: "2026-10-12",
  meetingTime: "14:00",
  meetingLocation: "Domicile de la mère",
  interviewType: "Visite à domicile",
  purpose: "Point sur la scolarité",
  attendees: "La mère, Lucas",
};

describe("moteur de rédaction (exemple du cahier des charges)", async () => {
  const result = await runDraftingPipeline(input);
  const byCat = (cat: string) =>
    result.analysis.items.filter((i) => i.category === cat).map((i) => result.analysis.segments.find((s) => s.id === i.segmentId)!.text);

  it("classe les propos selon leur auteur", () => {
    expect(byCat("PROPOS_PARENT")).toEqual([
      "Mère explique école difficile depuis rentrée.",
      "Mère dit père appelle peu.",
      "Maman demande aide inscription foot.",
    ]);
    expect(byCat("PROPOS_ENFANT")).toEqual(["Lucas dit professeur crie beaucoup.", "Lucas ne veut pas parler du père."]);
  });

  it("distingue observations et actions prévues", () => {
    expect(byCat("OBSERVATION")).toEqual(expect.arrayContaining(["Enfant présent.", "Logement propre.", "Lucas a une chambre individuelle."]));
    expect(byCat("ACTION_PREVUE")).toEqual(["Appeler école + club."]);
  });

  it("attribue les propos sans citation inventée", () => {
    const child = result.content.sections.find((s) => s.key === "EXPRESSION_ENFANT")!.text;
    expect(child).toContain("Lucas indique : professeur crie beaucoup.");
    expect(child).not.toMatch(/[«»"]/);
    const parents = result.content.sections.find((s) => s.key === "EXPRESSION_PARENTS")!.text;
    expect(parents).toContain("La mère explique : école difficile depuis rentrée.");
  });

  it("ne produit que des affirmations étayées par les notes", () => {
    expect(result.claims.length).toBeGreaterThan(8);
    const notGreen = result.claims.filter((c) => c.level !== "GREEN");
    expect(notGreen).toEqual([]);
  });

  it("signale le passage vigilance sans l'insérer dans le rapport", () => {
    expect(result.analysis.suggestions.some((s) => s.kind === "VIGILANCE")).toBe(true);
    expect(result.content.sections.find((s) => s.key === "VIGILANCE")!.text).toBe("");
  });

  it("signale les informations manquantes sans les inventer", () => {
    const ids = result.alerts.map((a) => a.id);
    expect(ids).toContain("no-deadline");
    expect(ids).toContain("parents-informed");
  });

  it("détecte l'appréciation non étayée de l'exemple § 9.3 (rouge)", () => {
    const content = structuredClone(result.content);
    content.sections.find((s) => s.key === "OBSERVATIONS")!.text += "\nLa relation mère-enfant apparaît sécurisante.";
    const claims = verifyReport(content, { segments: result.analysis.segments, childAlias: "Lucas" });
    const claim = claims.find((c) => c.text.includes("sécurisante"))!;
    expect(claim.level).toBe("RED");
  });

  it("détecte une citation, une date, un diagnostic ou une attribution inventés", () => {
    const content = structuredClone(result.content);
    const add = (t: string) => (content.sections.find((s) => s.key === "OBSERVATIONS")!.text += "\n" + t);
    add("Lucas indique : « le professeur me frappe ».");
    add("Le logement était propre le 03/09/2026.");
    add("Lucas présente un TDAH.");
    add("Le père explique : école difficile depuis rentrée.");
    const claims = verifyReport(content, { segments: result.analysis.segments, childAlias: "Lucas" });
    for (const needle of ["me frappe", "03/09/2026", "TDAH", "Le père explique"]) {
      expect(claims.find((c) => c.text.includes(needle))?.level, needle).toBe("RED");
    }
  });

  it("classe une reformulation partielle en orange", () => {
    const content = structuredClone(result.content);
    content.sections.find((s) => s.key === "OBSERVATIONS")!.text += "\nLe logement est propre et chaleureux.";
    const claims = verifyReport(content, { segments: result.analysis.segments, childAlias: "Lucas" });
    expect(claims.find((c) => c.text.includes("chaleureux"))!.level).toBe("ORANGE");
  });
});
