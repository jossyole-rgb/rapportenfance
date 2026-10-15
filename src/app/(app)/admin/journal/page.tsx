import type { Metadata } from "next";
import Link from "next/link";
import { requireUserWith } from "@/lib/auth/guard";
import { canViewAuditLog } from "@/lib/auth/permissions";
import { listAuditLog } from "@/lib/services/admin";
import { AUDIT_LABELS, type AuditAction } from "@/lib/audit";
import { Card, PageHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Journal d'audit" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; action?: string }> }) {
  const user = await requireUserWith(canViewAuditLog);
  const sp = await searchParams;
  const action = sp.action && sp.action in AUDIT_LABELS ? sp.action : undefined;
  const { rows, total, page } = await listAuditLog(user, { page: Number(sp.page) || 1, action });
  const pages = Math.max(1, Math.ceil(total / 50));
  const href = (p: number) => `/admin/journal?page=${p}${action ? `&action=${action}` : ""}`;
  return (
    <>
      <PageHeader title="Journal d'audit" description="Connexions, consultations, modifications, validations et exports. Le journal ne contient jamais le contenu des notes ou des écrits." />
      <form className="mb-4 flex gap-2">
        <label htmlFor="action" className="sr-only">Type d&apos;événement</label>
        <Select id="action" name="action" defaultValue={action ?? ""} className="max-w-xs">
          <option value="">Tous les événements</option>
          {Object.entries(AUDIT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Button type="submit" variant="secondary">Filtrer</Button>
      </form>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Événement</th>
                <th className="px-5 py-3 font-medium">Utilisateur</th>
                <th className="px-5 py-3 font-medium">Ressource</th>
                <th className="px-5 py-3 font-medium">Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{fmtDateTime(r.createdAt)}</td>
                  <td className="px-5 py-2.5 font-medium text-slate-800">{AUDIT_LABELS[r.action as AuditAction] ?? r.action}</td>
                  <td className="px-5 py-2.5 text-slate-600">{r.actorName ?? r.actorEmail ?? "Système"}</td>
                  <td className="px-5 py-2.5 text-slate-600">
                    {r.resourceType === "document" && r.resourceId ? <Link href={`/ecrits/${r.resourceId}`} className="font-mono text-xs text-brand-700 hover:underline">écrit {r.resourceId.slice(-6)}</Link> : r.resourceType ? `${r.resourceType} ${r.resourceId?.slice(-6) ?? ""}` : "-"}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-xs text-slate-500">{r.metadata ? Object.entries(r.metadata as Record<string, unknown>).map(([k, v]) => `${k}=${v}`).join(" ") : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <nav className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm" aria-label="Pagination">
          {page > 1 ? <Link href={href(page - 1)} className="font-medium text-brand-700 hover:underline">Précédent</Link> : <span />}
          <span className="text-slate-500">Page {page} sur {pages} · {total} événement(s)</span>
          {page < pages ? <Link href={href(page + 1)} className="font-medium text-brand-700 hover:underline">Suivant</Link> : <span />}
        </nav>
      </Card>
    </>
  );
}
