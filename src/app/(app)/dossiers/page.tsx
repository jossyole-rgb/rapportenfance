import type { Metadata } from "next";
import Link from "next/link";
import { FolderOpen, FolderPlus, Search } from "lucide-react";
import { requireCaseUser } from "@/lib/auth/guard";
import { listCaseFiles } from "@/lib/services/case-files";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Button, LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badges";
import { fmtRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Dossiers" };

export default async function CaseFilesPage({ searchParams }: { searchParams: Promise<{ q?: string; archives?: string }> }) {
  const user = await requireCaseUser();
  const sp = await searchParams;
  const q = sp.q?.slice(0, 60);
  const rows = await listCaseFiles(user, { q, includeArchived: sp.archives === "1" });
  return (
    <>
      <PageHeader
        title="Dossiers"
        description={user.roles.includes("VALIDATOR") ? "Tous les dossiers de votre établissement." : "Les dossiers dont vous êtes membre."}
        actions={
          <LinkButton href="/dossiers/nouveau">
            <FolderPlus className="size-4" aria-hidden /> Nouveau dossier
          </LinkButton>
        }
      />
      <form className="mb-4 flex flex-wrap items-center gap-3" role="search">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Rechercher un identifiant de dossier" aria-label="Rechercher un dossier" className="pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="archives" value="1" defaultChecked={sp.archives === "1"} className="size-4 accent-brand-700" /> Inclure les dossiers archivés
        </label>
        <Button type="submit" variant="secondary">Rechercher</Button>
      </form>
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="size-6" />}
            title={q ? "Aucun dossier ne correspond à votre recherche" : "Aucun dossier"}
            description="Un dossier regroupe les écrits relatifs à un enfant, identifié par un identifiant pseudonyme."
            action={<LinkButton href="/dossiers/nouveau">Créer un dossier</LinkButton>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Dossier</th>
                  <th className="px-5 py-3 font-medium">Service</th>
                  <th className="px-5 py-3 font-medium">Écrits</th>
                  <th className="px-5 py-3 font-medium">Membres</th>
                  <th className="px-5 py-3 font-medium">Dernière activité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`/dossiers/${r.id}`} className="font-medium text-brand-700 hover:underline">
                        {r.reference}
                      </Link>
                      {r.childAlias && <span className="ml-2 text-slate-500">({r.childAlias})</span>}
                      {r.status === "ARCHIVED" && <Badge className="ml-2">Archivé</Badge>}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{r.serviceName ?? "-"}</td>
                    <td className="px-5 py-3 tabular-nums text-slate-600">{r.documentCount}</td>
                    <td className="px-5 py-3 text-slate-600">{r.members.map((m) => m.fullName).join(", ")}</td>
                    <td className="px-5 py-3 text-slate-500">{fmtRelative(r.lastActivity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
