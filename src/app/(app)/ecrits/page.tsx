import type { Metadata } from "next";
import Link from "next/link";
import { FileClock, FilePlus2 } from "lucide-react";
import { requireCaseUser } from "@/lib/auth/guard";
import { PAGE_SIZE, listAuthors, listDocuments } from "@/lib/services/documents";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Button, LinkButton } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { StatusBadge } from "@/components/ui/badges";
import { DOCUMENT_TYPE_OPTIONS, getTemplate } from "@/lib/domain/document-types";
import { STATUSES, STATUS_LABELS, type Status } from "@/lib/domain/workflow";
import { fmtDate, fmtRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Écrits et historique" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireCaseUser();
  const sp = await searchParams;
  const [{ rows, total, page, filters }, authors] = await Promise.all([listDocuments(user, sp), listAuthors(user)]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `/ecrits?${u.toString()}`;
  };
  return (
    <>
      <PageHeader
        title="Écrits et historique"
        description="Recherchez, filtrez et reprenez vos écrits. Les écrits archivés s'affichent avec le filtre « Archivé »."
        actions={
          <LinkButton href="/ecrits/nouveau">
            <FilePlus2 className="size-4" aria-hidden /> Nouvel écrit
          </LinkButton>
        }
      />
      <Card className="mb-4">
        <form className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6" role="search" aria-label="Filtrer les écrits">
          <div className="lg:col-span-2">
            <label htmlFor="q" className="mb-1 block text-xs font-medium text-slate-600">Dossier</label>
            <Input id="q" name="q" defaultValue={filters.q} placeholder="Identifiant de dossier" />
          </div>
          <div>
            <label htmlFor="type" className="mb-1 block text-xs font-medium text-slate-600">Type d&apos;écrit</label>
            <Select id="type" name="type" defaultValue={filters.type ?? ""}>
              <option value="">Tous</option>
              {DOCUMENT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="status" className="mb-1 block text-xs font-medium text-slate-600">Statut</label>
            <Select id="status" name="status" defaultValue={filters.status ?? ""}>
              <option value="">En cours et validés</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="authorId" className="mb-1 block text-xs font-medium text-slate-600">Auteur</label>
            <Select id="authorId" name="authorId" defaultValue={filters.authorId ?? ""}>
              <option value="">Tous</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>{a.fullName}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1 lg:grid-cols-1">
            <div>
              <label htmlFor="from" className="mb-1 block text-xs font-medium text-slate-600">Du</label>
              <Input id="from" name="from" type="date" defaultValue={filters.from} />
            </div>
            <div>
              <label htmlFor="to" className="mb-1 block text-xs font-medium text-slate-600">Au</label>
              <Input id="to" name="to" type="date" defaultValue={filters.to} />
            </div>
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
            <Button type="submit">Filtrer</Button>
            <LinkButton href="/ecrits" variant="ghost">Réinitialiser</LinkButton>
            <span className="ml-auto text-sm text-slate-500">{total} écrit(s)</span>
          </div>
        </form>
      </Card>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<FileClock className="size-6" />} title="Aucun écrit ne correspond à ces critères" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Écrit</th>
                  <th className="px-5 py-3 font-medium">Dossier</th>
                  <th className="px-5 py-3 font-medium">Rendez-vous</th>
                  <th className="px-5 py-3 font-medium">Auteur</th>
                  <th className="px-5 py-3 font-medium">Version</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                  <th className="px-5 py-3 font-medium">Modifié</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`/ecrits/${d.id}`} className="font-medium text-brand-700 hover:underline">{getTemplate(d.type).label}</Link>
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/dossiers/${d.caseFile.id}`} className="text-slate-700 hover:underline">{d.caseFile.reference}</Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{fmtDate(d.meetingDate)}</td>
                    <td className="px-5 py-3 text-slate-600">{d.authorName}</td>
                    <td className="px-5 py-3 tabular-nums text-slate-600">{d.currentVersion}</td>
                    <td className="px-5 py-3"><StatusBadge status={d.status as Status} /></td>
                    <td className="px-5 py-3 text-slate-500">{fmtRelative(d.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <nav className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm" aria-label="Pagination">
            {page > 1 ? <Link href={qs(page - 1)} className="font-medium text-brand-700 hover:underline">Précédent</Link> : <span />}
            <span className="text-slate-500">Page {page} sur {pages}</span>
            {page < pages ? <Link href={qs(page + 1)} className="font-medium text-brand-700 hover:underline">Suivant</Link> : <span />}
          </nav>
        )}
      </Card>
    </>
  );
}
