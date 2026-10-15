import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCaseUser } from "@/lib/auth/guard";
import { compareDocumentVersions } from "@/lib/services/documents";
import { DOCUMENT_TEMPLATES } from "@/lib/domain/document-types";
import { AppError } from "@/lib/errors";
import { fmtDateTime } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badges";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import type { DiffPart, SectionDiff } from "@/lib/diff";

export const metadata: Metadata = { title: "Comparer deux versions" };

const STATUS_BADGE: Record<SectionDiff["status"], { label: string; tone: "slate" | "amber" | "green" | "red" }> = {
  unchanged: { label: "Inchangée", tone: "slate" },
  modified: { label: "Modifiée", tone: "amber" },
  added: { label: "Ajoutée", tone: "green" },
  removed: { label: "Supprimée", tone: "red" },
};

function Part({ p }: { p: DiffPart }) {
  if (p.type === "added") return <ins className="rounded-sm bg-ok-50 text-ok-700 underline decoration-ok-600/50">{p.text}</ins>;
  if (p.type === "removed") return <del className="rounded-sm bg-err-50 text-err-700 decoration-err-600/60">{p.text}</del>;
  return <span>{p.text}</span>;
}

export default async function ComparePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireCaseUser();
  const { id } = await params;
  const sp = await searchParams;
  const to = Number(sp.a);
  const from = Number(sp.de);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) notFound();
  let cmp;
  try {
    cmp = await compareDocumentVersions(user, id, from, to);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const changed = cmp.diffs.filter((d) => d.status !== "unchanged");
  const label = (v: { version: number }) =>
    `v${v.version}${v.version === cmp.currentVersion ? " (actuelle)" : ""}${v.version === cmp.validatedVersion ? " (validée)" : ""}`;

  return (
    <>
      <PageHeader
        eyebrow={<Link href={`/ecrits/${id}`} className="hover:underline">Retour à l&apos;écrit</Link>}
        title={`Comparer deux versions`}
        description={`${DOCUMENT_TEMPLATES[cmp.type].label} · dossier ${cmp.caseReference} · consultation seule`}
      />
      <Card className="mb-6">
        <form method="get" className="flex flex-wrap items-end gap-3 px-5 py-4">
          <label className="text-sm text-slate-700">
            <span className="mb-1 block text-xs text-slate-500">Version de départ</span>
            <Select name="de" defaultValue={String(cmp.from.version)} className="w-56">
              {cmp.versions.map((v) => <option key={v.version} value={v.version}>{label(v)} · {v.createdByName}</option>)}
            </Select>
          </label>
          <label className="text-sm text-slate-700">
            <span className="mb-1 block text-xs text-slate-500">Version comparée</span>
            <Select name="a" defaultValue={String(cmp.to.version)} className="w-56">
              {cmp.versions.map((v) => <option key={v.version} value={v.version}>{label(v)} · {v.createdByName}</option>)}
            </Select>
          </label>
          <Button type="submit" variant="secondary">Comparer</Button>
        </form>
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
          <span>
            <strong className="text-slate-900">v{cmp.from.version}</strong> · {cmp.from.createdByName} · {fmtDateTime(cmp.from.createdAt)}
          </span>
          <span aria-hidden>→</span>
          <span>
            <strong className="text-slate-900">v{cmp.to.version}</strong> · {cmp.to.createdByName} · {fmtDateTime(cmp.to.createdAt)}
          </span>
          <span className="ml-auto" data-testid="diff-stats">
            {cmp.stats.changedSections} rubrique(s) modifiée(s) · <span className="text-ok-700">+{cmp.stats.added} mot(s)</span> · <span className="text-err-700">−{cmp.stats.removed} mot(s)</span>
          </span>
        </div>
      </Card>

      {changed.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-slate-600">Aucune différence entre ces deux versions.</Card>
      ) : (
        <Card className="mx-auto max-w-4xl">
          <div className="px-6 py-8 sm:px-12">
            <p className="mb-6 text-xs text-slate-500">
              <ins className="bg-ok-50 text-ok-700">Texte ajouté</ins> · <del className="bg-err-50 text-err-700">texte supprimé</del>. Les rubriques inchangées sont repliées.
            </p>
            {cmp.diffs.map((d) =>
              d.status === "unchanged" ? (
                <details key={d.key} className="mb-4 text-sm text-slate-500">
                  <summary className="cursor-pointer">{d.title} (inchangée)</summary>
                  <p className="mt-2 whitespace-pre-line leading-relaxed text-slate-700">{d.parts.map((p) => p.text).join("")}</p>
                </details>
              ) : (
                <section key={d.key} className="mb-6" aria-label={d.title}>
                  <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-brand-800">
                    {d.title} <Badge tone={STATUS_BADGE[d.status].tone}>{STATUS_BADGE[d.status].label}</Badge>
                  </h2>
                  <p className="whitespace-pre-line leading-relaxed text-slate-800">
                    {d.parts.map((p, i) => <Part key={i} p={p} />)}
                  </p>
                </section>
              ),
            )}
          </div>
        </Card>
      )}
    </>
  );
}
