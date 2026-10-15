import type { Metadata } from "next";
import Link from "next/link";
import { requireCaseUser } from "@/lib/auth/guard";
import { listCaseFiles } from "@/lib/services/case-files";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { DocumentForm } from "@/components/document-form";
import { createDocumentAction } from "@/app/actions/documents";
import { todayIso } from "@/lib/format";
import { DOCUMENT_TYPES, type DocumentTypeKey } from "@/lib/domain/document-types";
import { db } from "@/lib/db";
import { FolderPlus } from "lucide-react";

export const metadata: Metadata = { title: "Nouvel écrit" };

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<{ dossier?: string; type?: string }> }) {
  const user = await requireCaseUser();
  const sp = await searchParams;
  // Seuls les dossiers actifs dont l'utilisateur est membre peuvent recevoir un nouvel écrit
  const all = await listCaseFiles(user);
  const caseFiles = all.filter((c) => c.members.some((m) => m.id === user.id));
  const profile = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { jobTitle: true, serviceName: true } });
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/ecrits" className="hover:underline">Écrits</Link>}
        title="Nouvel écrit"
        description="Renseignez le contexte du rendez-vous puis vos notes. Le projet d'écrit sera généré pour relecture : rien n'est validé automatiquement."
      />
      {caseFiles.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderPlus className="size-6" />}
            title="Créez d'abord un dossier"
            description="Chaque écrit est rattaché à un dossier dont vous êtes membre."
            action={<LinkButton href="/dossiers/nouveau?then=ecrit">Créer un dossier</LinkButton>}
          />
        </Card>
      ) : (
        <DocumentForm
          mode="create"
          action={createDocumentAction}
          caseFiles={caseFiles.map((c) => ({ id: c.id, reference: c.reference, childAlias: c.childAlias }))}
          defaults={{
            caseFileId: caseFiles.some((c) => c.id === sp.dossier) ? sp.dossier : undefined,
            type: DOCUMENT_TYPES.includes(sp.type as DocumentTypeKey) ? (sp.type as DocumentTypeKey) : undefined,
            authorName: user.fullName,
            authorJobTitle: profile.jobTitle,
            serviceName: profile.serviceName,
            meetingDate: todayIso(),
          }}
        />
      )}
    </>
  );
}
