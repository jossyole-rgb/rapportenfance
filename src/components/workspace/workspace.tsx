"use client";

import { useActionState, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileText,
  History,
  ListChecks,
  Loader2,
  NotebookPen,
  PenLine,
  RotateCcw,
  Save,
  SearchCheck,
  ShieldCheck,
  XCircle,
  Lightbulb,
} from "lucide-react";
import type { SectionKey } from "@/lib/domain/categories";
import { CATEGORY_LABELS } from "@/lib/domain/categories";
import { STATUS_LABELS, type Status } from "@/lib/domain/workflow";
import { verifyReport, summarize, VERIFICATION_DISCLAIMER, claimHash } from "@/lib/ai/verifier";
import { completenessAlerts, qualityChecks, qualityIndicator, MANUAL_REVIEW_ITEMS } from "@/lib/ai/completeness";
import { splitSentences } from "@/lib/ai/text";
import { PLACEHOLDER_PREFIX, type Analysis, type EngineInput, type ReportContent, type SourceSegment, type VerifiedClaim } from "@/lib/ai/types";
import type { DocumentTypeKey } from "@/lib/domain/document-types";
import { confirmClaimAction, markReviewedAction, reopenAction, restoreVersionAction, saveContentAction, validateAction } from "@/app/actions/documents";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Checkbox, Input, Textarea } from "@/components/ui/field";
import { LEVEL_STYLES } from "@/components/ui/badges";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormFeedback } from "@/components/form-feedback";
import { cn } from "@/components/ui/cn";
import { fmtDateTime } from "@/lib/format";

export type WorkspaceProps = {
  documentId: string;
  type: DocumentTypeKey;
  status: Status;
  currentVersion: number;
  content: ReportContent;
  analysis: Analysis | null;
  segments: SourceSegment[];
  input: EngineInput;
  engine: string | null;
  validationMode: "SELF" | "SUPERVISOR";
  validatedAt: Date | null;
  validatorName: string | null;
  reviewedAt: Date | null;
  reviewerName: string | null;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
  versions: Array<{ version: number; origin: string; changeSummary: string | null; createdAt: Date; createdByName: string }>;
  permissions: { edit: boolean; review: boolean; validate: boolean; reopen: boolean };
};

type Tab = "edit" | "preview" | "sources" | "review" | "versions";

const TABS: Array<{ id: Tab; label: string; icon: typeof PenLine }> = [
  { id: "edit", label: "Rédaction et vérification", icon: PenLine },
  { id: "preview", label: "Aperçu", icon: Eye },
  { id: "sources", label: "Notes sources", icon: NotebookPen },
  { id: "review", label: "Contrôle qualité et validation", icon: ClipboardCheck },
  { id: "versions", label: "Versions", icon: History },
];

export function Workspace(props: WorkspaceProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("edit");
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(props.content.sections.map((s) => [s.key, s.text])));
  const [savedTexts, setSavedTexts] = useState(texts);
  const [selectedClaim, setSelectedClaim] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [saveState, setSaveState] = useState<{ error?: string; message?: string }>({});
  const [summary, setSummary] = useState("");
  const [saving, startSave] = useTransition();

  // Resynchronise l'état local quand une nouvelle version arrive du serveur
  const versionRef = useRef(props.currentVersion);
  useEffect(() => {
    if (versionRef.current !== props.currentVersion) {
      versionRef.current = props.currentVersion;
      const fresh = Object.fromEntries(props.content.sections.map((s) => [s.key, s.text]));
      setTexts(fresh);
      setSavedTexts(fresh);
    }
  }, [props.currentVersion, props.content]);

  const dirty = props.content.sections.some((s) => texts[s.key] !== savedTexts[s.key]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Vérification en direct (même algorithme que la vérification serveur)
  const deferredTexts = useDeferredValue(texts);
  const liveContent: ReportContent = useMemo(
    () => ({ sections: props.content.sections.map((s) => ({ ...s, text: deferredTexts[s.key] ?? "" })), acknowledgements: props.content.acknowledgements }),
    [deferredTexts, props.content],
  );
  const claims = useMemo(() => verifyReport(liveContent, { segments: props.segments, childAlias: props.input.childAlias }), [liveContent, props.segments, props.input.childAlias]);
  const sum = summarize(claims);
  const completenessInput = { documentType: props.type, content: liveContent, analysis: props.analysis, form: props.input };
  const alerts = useMemo(() => completenessAlerts(completenessInput), [liveContent]); // eslint-disable-line react-hooks/exhaustive-deps
  const checks = useMemo(() => qualityChecks(completenessInput, claims, props.input.childAlias), [liveContent, claims]); // eslint-disable-line react-hooks/exhaustive-deps

  const segById = useMemo(() => new Map(props.segments.map((s) => [s.id, s])), [props.segments]);
  const selected = claims.find((c) => c.id === selectedClaim) ?? null;

  const save = () => {
    setSaveState({});
    startSave(async () => {
      const res = await saveContentAction(props.documentId, {
        baseVersion: props.currentVersion,
        sections: props.content.sections.map((s) => ({ key: s.key, text: texts[s.key] ?? "" })),
        changeSummary: summary || undefined,
      });
      if (res.ok) {
        setSavedTexts(texts);
        setSummary("");
        setSaveState({ message: res.unchanged ? "Aucune modification à enregistrer." : `Version ${res.version} enregistrée.` });
        router.refresh();
      } else setSaveState({ error: res.error });
    });
  };

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Espace de travail">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              tab === t.id ? "border-brand-700 text-brand-800" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            <t.icon className="size-4" aria-hidden />
            {t.label}
            {t.id === "edit" && sum.redUnacknowledged > 0 && (
              <span className="rounded-full bg-err-600 px-1.5 text-[11px] text-white" aria-label={`${sum.redUnacknowledged} non retrouvés`}>{sum.redUnacknowledged}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "edit" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="space-y-4">
            {!props.permissions.edit && (
              <Alert tone={props.status === "VALIDATED" || props.status === "EXPORTED" ? "success" : "info"}>
                {props.status === "VALIDATED" || props.status === "EXPORTED"
                  ? "Document validé : il n'est plus modifiable. Rouvrez-le depuis l'onglet « Contrôle qualité et validation » pour le corriger."
                  : "Consultation seule : vous n'avez pas les droits de modification sur ce document dans son état actuel."}
              </Alert>
            )}
            {props.content.sections.map((section) => {
              const sectionClaims = claims.filter((c) => c.sectionKey === section.key);
              const flagged = sectionClaims.filter((c) => c.level !== "GREEN");
              const text = texts[section.key] ?? "";
              return (
                <Card key={section.key}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
                    <h3 className="font-semibold text-slate-900">
                      {section.title}
                      {section.required && <span className="ml-1 text-xs font-normal text-slate-400">(obligatoire)</span>}
                    </h3>
                    <ClaimCounts claims={sectionClaims} />
                  </div>
                  <div className="px-5 py-3">
                    <label htmlFor={`section-${section.key}`} className="sr-only">{section.title}</label>
                    <Textarea
                      id={`section-${section.key}`}
                      value={text}
                      disabled={!props.permissions.edit}
                      onChange={(e) => setTexts((t) => ({ ...t, [section.key]: e.target.value }))}
                      rows={Math.min(14, Math.max(3, text.split("\n").length + 1))}
                      className={cn("text-[14px]", text.includes(PLACEHOLDER_PREFIX) && "bg-amber-50/40")}
                      placeholder="Rubrique vide : rien dans vos notes ne correspond à cette rubrique."
                    />
                    {flagged.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {flagged.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedClaim(c.id)}
                              className={cn(
                                "flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-slate-50",
                                selectedClaim === c.id && "bg-slate-100",
                              )}
                            >
                              <LevelDot level={c.level} acknowledged={!!c.acknowledged} />
                              <span className="min-w-0">
                                <span className="font-medium text-slate-700">« {c.text.length > 90 ? c.text.slice(0, 90) + "…" : c.text} »</span>
                                <span className="block text-slate-500">{c.acknowledged ? `Confirmé par ${c.acknowledged.userName}` : c.reasons[0]}</span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Card>
              );
            })}
            {props.permissions.edit && (
              <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
                <div className="min-w-[200px] flex-1">
                  <label htmlFor="changeSummary" className="sr-only">Résumé de la modification</label>
                  <Input id="changeSummary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={200} placeholder="Résumé de la modification (facultatif)" />
                </div>
                <span className={cn("text-sm", dirty ? "font-medium text-amber-700" : "text-slate-500")} aria-live="polite">
                  {saveState.error ? "" : dirty ? "Modifications non enregistrées" : saveState.message ?? `Version ${props.currentVersion}`}
                </span>
                <Button type="button" onClick={save} disabled={!dirty || saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
                  Enregistrer une nouvelle version
                </Button>
                {saveState.error && <p className="w-full text-sm font-medium text-err-700" role="alert">{saveState.error}</p>}
              </div>
            )}
          </div>

          <aside className="space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
            <Card>
              <CardHeader title="Contrôle des sources" description="Rapprochement de chaque affirmation avec vos notes." />
              <CardBody className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  {(["GREEN", "ORANGE", "RED"] as const).map((l) => (
                    <div key={l} className={cn("rounded-lg px-2 py-2 ring-1 ring-inset", LEVEL_STYLES[l].bg, LEVEL_STYLES[l].ring)}>
                      <p className={cn("text-xl font-semibold tabular-nums", LEVEL_STYLES[l].text)}>{l === "GREEN" ? sum.green : l === "ORANGE" ? sum.orange : sum.red}</p>
                      <p className={cn("text-xs", LEVEL_STYLES[l].text)}>{LEVEL_STYLES[l].label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs leading-relaxed text-slate-500">{VERIFICATION_DISCLAIMER}</p>
              </CardBody>
            </Card>

            {selected ? (
              <ClaimDetail
                claim={selected}
                segById={segById}
                canConfirm={props.permissions.edit && !dirty}
                documentId={props.documentId}
                onClose={() => setSelectedClaim(null)}
                onConfirmed={() => router.refresh()}
              />
            ) : (
              <Card>
                <CardBody className="text-sm text-slate-500">
                  Sélectionnez un passage signalé (orange ou rouge) pour consulter les éléments sources correspondants.
                </CardBody>
              </Card>
            )}

            <Card>
              <CardHeader
                title="Qu'est-ce qui manque à mon rapport ?"
                actions={
                  <Button type="button" size="sm" variant="secondary" onClick={() => setShowMissing((v) => !v)} aria-expanded={showMissing}>
                    <SearchCheck className="size-4" aria-hidden /> {showMissing ? "Masquer" : `Analyser (${alerts.length})`}
                  </Button>
                }
              />
              {showMissing && (
                <CardBody>
                  {alerts.length === 0 ? (
                    <p className="text-sm text-ok-700">Aucun manque détecté par les contrôles automatiques.</p>
                  ) : (
                    <ul className="space-y-2">
                      {alerts.map((a) => (
                        <li key={a.id} className="flex gap-2 text-sm">
                          {a.severity === "warning" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn-500" aria-hidden /> : <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden />}
                          <span className="text-slate-700">{a.message}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 text-xs text-slate-500">L&apos;outil signale les manques sans proposer de contenu : c&apos;est à vous de décider s&apos;il faut compléter.</p>
                </CardBody>
              )}
            </Card>

            {props.analysis && props.analysis.suggestions.length > 0 && (
              <Card>
                <CardHeader title="Éléments à apprécier" description="Repérés dans vos notes, non insérés automatiquement." />
                <CardBody>
                  <ul className="space-y-3">
                    {props.analysis.suggestions.map((s) => (
                      <li key={s.id} className="text-sm">
                        <p className="rounded-md bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700">{segById.get(s.segmentId)?.text}</p>
                        <p className="mt-1 text-xs text-slate-600">{s.message}</p>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            )}
          </aside>
        </div>
      )}

      {tab === "preview" && <Preview content={liveContent} claims={claims} status={props.status} />}
      {tab === "sources" && <SourcesPanel segments={props.segments} analysis={props.analysis} engine={props.engine} />}
      {tab === "review" && (
        <ReviewPanel
          {...props}
          checks={checks}
          dirty={dirty}
          redUnacknowledged={sum.redUnacknowledged}
          hasPlaceholders={liveContent.sections.some((s) => s.text.includes(PLACEHOLDER_PREFIX))}
        />
      )}
      {tab === "versions" && <VersionsPanel {...props} />}
    </div>
  );
}

function LevelDot({ level, acknowledged }: { level: VerifiedClaim["level"]; acknowledged?: boolean }) {
  if (acknowledged) return <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-slate-500" aria-label="Confirmé par le professionnel" />;
  return <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", LEVEL_STYLES[level].dot)} aria-label={LEVEL_STYLES[level].label} />;
}

function ClaimCounts({ claims }: { claims: VerifiedClaim[] }) {
  if (!claims.length) return null;
  const s = summarize(claims);
  return (
    <span className="flex items-center gap-3 text-xs text-slate-500">
      <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-ok-600" aria-hidden />{s.green}</span>
      {s.orange > 0 && <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-warn-500" aria-hidden />{s.orange}</span>}
      {s.red > 0 && <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-err-600" aria-hidden />{s.red}</span>}
      <span className="sr-only">{s.green} étayé(s), {s.orange} à vérifier, {s.red} non retrouvé(s)</span>
    </span>
  );
}

function ClaimDetail({
  claim,
  segById,
  canConfirm,
  documentId,
  onClose,
  onConfirmed,
}: {
  claim: VerifiedClaim;
  segById: Map<string, SourceSegment>;
  canConfirm: boolean;
  documentId: string;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const style = LEVEL_STYLES[claim.level];
  return (
    <Card className={cn("ring-1", style.ring)}>
      <div className={cn("flex items-center justify-between rounded-t-xl px-5 py-3", style.bg)}>
        <p className={cn("flex items-center gap-2 text-sm font-semibold", style.text)}>
          {claim.level === "GREEN" ? <CheckCircle2 className="size-4" aria-hidden /> : claim.level === "ORANGE" ? <AlertTriangle className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
          {style.label}
          {claim.acknowledged && <span className="font-normal text-slate-600">· confirmé</span>}
        </p>
        <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:underline">Fermer</button>
      </div>
      <CardBody className="space-y-3 text-sm">
        <blockquote className="border-l-2 border-slate-300 pl-3 text-slate-800">{claim.text}</blockquote>
        <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
          {claim.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Éléments sources rapprochés</p>
          {claim.sourceSegmentIds.length === 0 ? (
            <p className="text-xs text-slate-500">Aucun élément des notes ne correspond à ce passage.</p>
          ) : (
            <ul className="space-y-1.5">
              {claim.sourceSegmentIds.map((id) => {
                const seg = segById.get(id);
                if (!seg) return null;
                return (
                  <li key={id} className="rounded-md bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-700">
                    <span className="mr-1.5 rounded bg-slate-200 px-1 text-[10px] text-slate-600">{seg.origin === "FORM" ? seg.label : id}</span>
                    {seg.text}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {claim.acknowledged && (
          <p className="rounded-md bg-slate-50 p-2 text-xs text-slate-600">
            Confirmé par {claim.acknowledged.userName} le {fmtDateTime(claim.acknowledged.at)} : « {claim.acknowledged.note} »
          </p>
        )}
        {claim.level === "RED" && !claim.acknowledged && (
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-600">
              Modifiez ou supprimez ce passage dans la rubrique. S&apos;il est exact mais absent de vos notes, vous pouvez le confirmer en indiquant sa source.
            </p>
            {canConfirm ? (
              <div className="mt-2 space-y-2">
                <label htmlFor="ack-note" className="text-xs font-medium text-slate-700">Source ou justification</label>
                <Input id="ack-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Exemple : appel téléphonique avec l'école du 10/10" />
                {error && <p className="text-xs font-medium text-err-700" role="alert">{error}</p>}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pending || note.trim().length < 5}
                  onClick={() =>
                    start(async () => {
                      const res = await confirmClaimAction(documentId, claim.text, note);
                      if (res.ok) {
                        setNote("");
                        setError(null);
                        onConfirmed();
                      } else setError(res.error);
                    })
                  }
                >
                  {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Confirmer ce passage
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Enregistrez d&apos;abord vos modifications pour pouvoir confirmer un passage.</p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Preview({ content, claims, status }: { content: ReportContent; claims: VerifiedClaim[]; status: Status }) {
  const levels = new Map(claims.map((c) => [c.id, c]));
  const draft = status !== "VALIDATED" && status !== "EXPORTED";
  return (
    <Card className="relative mx-auto max-w-4xl overflow-hidden">
      {draft && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden" aria-hidden>
          <span className="-rotate-[30deg] whitespace-nowrap text-6xl font-bold text-red-600/[0.07]">BROUILLON NON VALIDÉ</span>
        </div>
      )}
      <div className="relative px-6 py-8 sm:px-12">
        {draft && <p className="mb-4 text-center text-sm font-bold tracking-wide text-err-700">BROUILLON NON VALIDÉ</p>}
        <div className="mb-6 flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-warn-50 ring-1 ring-amber-300" aria-hidden /> À vérifier</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-sm bg-err-50 ring-1 ring-red-300" aria-hidden /> Non retrouvé dans les notes</span>
          <span>Le marquage n&apos;apparaît pas dans les exports.</span>
        </div>
        {content.sections
          .filter((s) => s.text.trim())
          .map((s) => (
            <section key={s.key} className="mb-6">
              <h3 className="mb-2 text-base font-semibold text-brand-800">{s.title}</h3>
              {s.text.split("\n").filter((l) => l.trim()).map((line, i) => (
                <p key={i} className="mb-1.5 leading-relaxed text-slate-800">
                  {splitSentences(line).map((sentence, j) => {
                    const c = levels.get(claimHash(sentence.text));
                    const cls = c && !c.acknowledged && c.level !== "GREEN" ? `claim-${c.level}` : "";
                    return (
                      <span key={j} className={cls} title={c && cls ? c.reasons[0] : undefined}>
                        {sentence.text}{" "}
                      </span>
                    );
                  })}
                </p>
              ))}
            </section>
          ))}
      </div>
    </Card>
  );
}

function SourcesPanel({ segments, analysis, engine }: { segments: SourceSegment[]; analysis: Analysis | null; engine: string | null }) {
  const itemBySeg = new Map((analysis?.items ?? []).map((i) => [i.segmentId, i]));
  const notes = segments.filter((s) => s.origin === "NOTES");
  const form = segments.filter((s) => s.origin === "FORM");
  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader
          title="Notes sources découpées"
          description="Chaque élément de vos notes, tel que saisi, et la catégorie retenue lors de la dernière génération."
        />
        <ol className="divide-y divide-slate-100">
          {notes.map((s) => {
            const item = itemBySeg.get(s.id);
            return (
              <li key={s.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                <span className="mt-0.5 w-8 shrink-0 font-mono text-xs text-slate-400">{s.id}</span>
                <p className="min-w-0 flex-1 font-mono text-[13px] text-slate-800">{s.text}</p>
                {item && (
                  <span className="text-right text-xs">
                    <span className="rounded-md bg-brand-50 px-2 py-0.5 font-medium text-brand-700">{CATEGORY_LABELS[item.category]}</span>
                    <span className="mt-1 block max-w-[240px] text-slate-500">{item.rationale}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader title="Informations du formulaire" />
          <CardBody>
            <dl className="space-y-2 text-sm">
              {form.map((s) => (
                <div key={s.id}>
                  <dt className="text-xs text-slate-500">{s.label}</dt>
                  <dd className="text-slate-800">{s.text}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Moteur utilisé" />
          <CardBody className="space-y-2 text-sm text-slate-600">
            <p>{analysis?.engineLabel ?? engine ?? "-"}</p>
            <p className="text-xs">
              Ce moteur structure et attribue vos notes à l&apos;aide de règles explicites, sans reformulation libre et sans transmission à un service extérieur. Si les notes ont été modifiées depuis la génération, le classement affiché peut ne plus correspondre.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function ReviewPanel(
  props: WorkspaceProps & {
    checks: ReturnType<typeof qualityChecks>;
    dirty: boolean;
    redUnacknowledged: number;
    hasPlaceholders: boolean;
  },
) {
  const [reviewState, reviewAction] = useActionState(markReviewedAction, undefined);
  const [validateState, validateFormAction] = useActionState(validateAction, undefined);
  const [reopenState, reopenFormAction] = useActionState(reopenAction, undefined);
  const indicator = qualityIndicator(props.checks);
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader
          title="Contrôles automatiques"
          description="Aide à la relecture. Ces contrôles ne valent pas validation et ne mesurent aucune conformité à un référentiel."
        />
        <CardBody className="space-y-4">
          <div className="flex items-center gap-4 rounded-lg bg-slate-50 p-4">
            <div className="relative grid size-16 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--color-brand-600) ${indicator * 3.6}deg, var(--color-slate-200) 0)` }}>
              <span className="grid size-12 place-items-center rounded-full bg-white text-sm font-semibold tabular-nums text-slate-800">{indicator}%</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Indicateur de qualité rédactionnelle (indicatif)</p>
              <p className="text-xs text-slate-500">Part des contrôles automatiques sans alerte. Il ne constitue pas une évaluation de conformité.</p>
            </div>
          </div>
          <ul className="space-y-3">
            {props.checks.map((c) => (
              <li key={c.id} className="text-sm">
                <p className="flex items-center gap-2 font-medium text-slate-800">
                  {c.status === "ok" ? <CheckCircle2 className="size-4 text-ok-600" aria-hidden /> : <AlertTriangle className="size-4 text-warn-500" aria-hidden />}
                  {c.label}
                  <span className="sr-only">{c.status === "ok" ? " : aucune alerte" : " : à vérifier"}</span>
                </p>
                {c.details.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-11 text-xs text-slate-600">
                    {c.details.slice(0, 5).map((d, i) => <li key={i}>{d}</li>)}
                    {c.details.length > 5 && <li>… et {c.details.length - 5} autre(s)</li>}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader title="1. Relire" description="Checklist de relecture à compléter par le professionnel." />
          <CardBody>
            {props.status === "GENERATED" || props.status === "TO_REVIEW" ? (
              props.permissions.review ? (
                <form action={reviewAction} className="space-y-3">
                  <FormFeedback state={reviewState} />
                  <input type="hidden" name="documentId" value={props.documentId} />
                  {MANUAL_REVIEW_ITEMS.map((i) => (
                    <Checkbox key={i.id} name="checklist" value={i.id} label={i.label} required />
                  ))}
                  {props.redUnacknowledged > 0 && (
                    <Alert tone="error">{props.redUnacknowledged} passage(s) non retrouvé(s) dans les notes doivent être modifiés, supprimés ou confirmés avant de terminer la relecture.</Alert>
                  )}
                  {props.dirty && <Alert tone="warning">Enregistrez vos modifications avant de terminer la relecture.</Alert>}
                  <SubmitButton disabled={props.dirty || props.redUnacknowledged > 0} pendingLabel="Enregistrement…">
                    <ListChecks className="size-4" aria-hidden /> Relecture terminée
                  </SubmitButton>
                </form>
              ) : (
                <p className="text-sm text-slate-500">Seul l&apos;auteur ou un validateur peut déclarer la relecture terminée.</p>
              )
            ) : props.reviewedAt ? (
              <p className="flex items-center gap-2 text-sm text-ok-700">
                <CheckCircle2 className="size-4" aria-hidden /> Relu par {props.reviewerName ?? "-"} le {fmtDateTime(props.reviewedAt)}.
              </p>
            ) : (
              <p className="text-sm text-slate-500">{props.status === "DRAFT" ? "Générez d'abord le projet d'écrit." : `Statut actuel : ${STATUS_LABELS[props.status]}.`}</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="2. Relire et valider"
            description={props.validationMode === "SUPERVISOR" ? "Validation par un validateur (chef de service) distinct de l'auteur." : "Validation par l'auteur ou un validateur."}
          />
          <CardBody>
            {props.status === "REVIEWED" ? (
              props.permissions.validate ? (
                <form action={validateFormAction} className="space-y-4">
                  <FormFeedback state={validateState} />
                  <input type="hidden" name="documentId" value={props.documentId} />
                  <input type="hidden" name="version" value={props.currentVersion} />
                  {props.hasPlaceholders && <Alert tone="error">Le document contient encore des passages « à compléter ».</Alert>}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <Checkbox
                      name="confirmation"
                      required
                      label="Je confirme avoir relu ce document, vérifié l'exactitude des informations et effectué les modifications nécessaires avant validation."
                    />
                  </div>
                  <SubmitButton variant="success" disabled={props.hasPlaceholders} pendingLabel="Validation…">
                    <ShieldCheck className="size-4" aria-hidden /> Valider la version {props.currentVersion}
                  </SubmitButton>
                </form>
              ) : (
                <p className="text-sm text-slate-600">
                  {props.validationMode === "SUPERVISOR"
                    ? "Ce document est relu et attend la validation d'un validateur (chef de service) autre que l'auteur."
                    : "Vous n'avez pas les droits de validation sur ce document."}
                </p>
              )
            ) : props.validatedAt ? (
              <div className="space-y-4">
                <p className="flex items-center gap-2 text-sm text-ok-700">
                  <ShieldCheck className="size-4" aria-hidden /> Validé par {props.validatorName ?? "-"} le {fmtDateTime(props.validatedAt)}.
                </p>
                {props.permissions.reopen && (
                  <form action={reopenFormAction} className="space-y-2 border-t border-slate-100 pt-4">
                    <FormFeedback state={reopenState} />
                    <input type="hidden" name="documentId" value={props.documentId} />
                    <p className="text-xs text-slate-500">Rouvrir annule la validation : le document devra être relu et validé à nouveau.</p>
                    <SubmitButton variant="secondary" size="sm" pendingLabel="Réouverture…">
                      <RotateCcw className="size-4" aria-hidden /> Rouvrir pour correction
                    </SubmitButton>
                  </form>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">La validation est possible une fois la relecture terminée.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function VersionsPanel(props: WorkspaceProps) {
  const [state, action] = useActionState(restoreVersionAction, undefined);
  return (
    <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader title="Historique des versions" description="Chaque enregistrement crée une version. Les versions ne sont jamais modifiées." />
        <FormFeedback state={state} />
        <ol className="divide-y divide-slate-100">
          {props.versions.map((v) => (
            <li key={v.version} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
              <span className="grid size-8 place-items-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">v{v.version}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800">
                  {v.changeSummary ?? (v.origin === "GENERATED" ? "Projet généré" : "Modification")}
                  {v.version === props.currentVersion && <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">actuelle</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {v.origin === "GENERATED" ? "Génération" : v.origin === "RESTORED" ? "Restauration" : "Modification manuelle"} · {v.createdByName} · {fmtDateTime(v.createdAt)}
                </p>
              </div>
              <Link href={`/ecrits/${props.documentId}/versions/${v.version}`} className="text-sm font-medium text-brand-700 hover:underline">
                Consulter
              </Link>
              {v.version !== props.currentVersion && (
                <Link
                  href={`/ecrits/${props.documentId}/comparer?de=${v.version}&a=${props.currentVersion}`}
                  className="text-sm font-medium text-brand-700 hover:underline"
                  aria-label={`Comparer la version ${v.version} avec la version actuelle`}
                >
                  Comparer
                </Link>
              )}
              {props.permissions.edit && v.version !== props.currentVersion && (
                <form action={action}>
                  <input type="hidden" name="documentId" value={props.documentId} />
                  <input type="hidden" name="version" value={v.version} />
                  <SubmitButton size="sm" variant="ghost">Restaurer</SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ol>
      </Card>
      <Card>
        <CardHeader title="Traçabilité" />
        <CardBody>
          <dl className="space-y-3 text-sm">
            {[
              ["Auteur", props.authorName],
              ["Créé le", fmtDateTime(props.createdAt)],
              ["Dernière modification", fmtDateTime(props.updatedAt)],
              ["Version actuelle", String(props.currentVersion)],
              ["Statut", STATUS_LABELS[props.status]],
              ["Relu par", props.reviewedAt ? `${props.reviewerName ?? "-"}, le ${fmtDateTime(props.reviewedAt)}` : "-"],
              ["Validé par", props.validatedAt ? `${props.validatorName ?? "-"}, le ${fmtDateTime(props.validatedAt)}` : "-"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="text-slate-800">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 flex items-start gap-1.5 text-xs text-slate-500">
            <FileText className="mt-px size-3.5 shrink-0" aria-hidden /> Les consultations, exports et validations sont tracés dans le journal d&apos;audit de l&apos;établissement.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

export type { SectionKey };
