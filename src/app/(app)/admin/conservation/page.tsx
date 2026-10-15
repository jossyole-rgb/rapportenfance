import type { Metadata } from "next";
import { requireUserWith } from "@/lib/auth/guard";
import { canManageRetention } from "@/lib/auth/permissions";
import { listArchivedDocuments } from "@/lib/services/admin";
import { deleteArchivedAction } from "@/app/actions/admin";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badges";
import { Alert } from "@/components/ui/alert";
import { getTemplate } from "@/lib/domain/document-types";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Conservation" };

export default async function RetentionPage() {
  const user = await requireUserWith(canManageRetention);
  const { rows, retentionDays } = await listArchivedDocuments(user);
  return (
    <>
      <PageHeader title="Conservation et suppression" description={`Documents archivés de l'établissement (métadonnées uniquement). Durée de conservation paramétrée : ${retentionDays} jours.`} />
      <Alert tone="info" className="mb-6">
        La purge automatique des documents dont la durée de conservation est échue s&apos;exécute avec la commande planifiée <code>npm run retention:purge</code> (voir la documentation de déploiement). La suppression est définitive et tracée.
      </Alert>
      <Card>
        <CardHeader title={`Documents archivés (${rows.length})`} />
        {rows.length === 0 ? (
          <EmptyState title="Aucun document archivé" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="font-medium text-slate-800">{getTemplate(r.type).label}</span>
                <span className="text-slate-500">Dossier {r.caseFile.reference} · {r.authorName}</span>
                <span className="text-xs text-slate-400">archivé le {r.archivedAt ? fmtDate(r.archivedAt) : "-"}</span>
                {r.expired && <Badge tone="amber">Durée échue</Badge>}
                <form action={deleteArchivedAction} className="ml-auto">
                  <input type="hidden" name="documentId" value={r.id} />
                  <button type="submit" className="text-sm font-medium text-err-700 hover:underline">Supprimer définitivement</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
