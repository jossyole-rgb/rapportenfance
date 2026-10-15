import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCaseUser } from "@/lib/auth/guard";
import { getDocumentVersion } from "@/lib/services/documents";
import { AppError } from "@/lib/errors";
import { Card, PageHeader } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Version" };

export default async function VersionPage({ params }: { params: Promise<{ id: string; version: string }> }) {
  const user = await requireCaseUser();
  const { id, version } = await params;
  const n = Number(version);
  if (!Number.isInteger(n) || n < 1) notFound();
  let v;
  try {
    v = await getDocumentVersion(user, id, n);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  return (
    <>
      <PageHeader
        eyebrow={<Link href={`/ecrits/${id}`} className="hover:underline">Retour à l&apos;écrit</Link>}
        actions={
          v.version > 1 ? (
            <Link href={`/ecrits/${id}/comparer?de=${v.version - 1}&a=${v.version}`} className="text-sm font-medium text-brand-700 hover:underline">
              Comparer avec la version précédente
            </Link>
          ) : undefined
        }
        title={`Version ${v.version}`}
        description={`${v.changeSummary ?? "-"} · ${v.createdByName} · ${fmtDateTime(v.createdAt)} · consultation seule`}
      />
      <Card className="mx-auto max-w-4xl">
        <div className="px-6 py-8 sm:px-12">
          {v.content.sections.filter((s) => s.text.trim()).map((s) => (
            <section key={s.key} className="mb-6">
              <h2 className="mb-2 text-base font-semibold text-brand-800">{s.title}</h2>
              {s.text.split("\n").filter((l) => l.trim()).map((l, i) => <p key={i} className="mb-1.5 leading-relaxed text-slate-800">{l}</p>)}
            </section>
          ))}
        </div>
      </Card>
    </>
  );
}
