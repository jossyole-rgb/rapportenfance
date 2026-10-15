import { LocalRulesProvider } from "./local-provider";
import type { Analysis, DraftingProvider, EngineInput, ReportContent, VerifiedClaim, CompletenessAlert } from "./types";
import { verifyReport } from "./verifier";
import { completenessAlerts } from "./completeness";

/**
 * Chaîne de rédaction en plusieurs étapes (§ 7.1) :
 * 1-3. analyse, extraction, classification  -> fournisseur (analyze)
 * 4.   construction selon la trame           -> fournisseur (compose)
 * 5-6. cohérence et affirmations non étayées -> vérificateur déterministe, indépendant du fournisseur
 * 7.   présentation au professionnel         -> interface
 * 8.   validation humaine                    -> workflow
 */

export function getProvider(name: string = process.env.AI_PROVIDER || "local"): DraftingProvider {
  switch (name) {
    case "local":
      return new LocalRulesProvider();
    default:
      // Aucun fournisseur externe n'est activé tant que son cadre (DPO, AIPD, contrat) n'est pas validé.
      throw new Error(`Fournisseur de rédaction « ${name} » non disponible.`);
  }
}

export type PipelineResult = {
  analysis: Analysis;
  content: ReportContent;
  claims: VerifiedClaim[];
  alerts: CompletenessAlert[];
};

export async function runDraftingPipeline(input: EngineInput, provider: DraftingProvider = getProvider()): Promise<PipelineResult> {
  const analysis = await provider.analyze(input);
  const sections = await provider.compose(input, analysis);
  const content: ReportContent = { sections, acknowledgements: [] };
  const claims = verifyReport(content, { segments: analysis.segments, childAlias: input.childAlias });
  const alerts = completenessAlerts({
    documentType: input.documentType,
    content,
    analysis,
    form: input,
  });
  return { analysis, content, claims, alerts };
}
