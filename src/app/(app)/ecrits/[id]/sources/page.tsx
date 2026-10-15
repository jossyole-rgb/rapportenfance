import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireCaseUser } from "@/lib/auth/guard";
import { getDocumentWorkspace } from "@/lib/services/documents";
import { AppError } from "@/lib/errors";
import { PageHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { DocumentForm } from "@/components/document-form";
import { updateInputsAction } from "@/app/actions/documents";

export const metadata: Metadata = { title: "Notes et informations" };

export default async function EditSourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCaseUser();
  const { id } = await params;
  let ws;
  try {
    ws = await getDocumentWorkspace(user, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  if (!ws.permissions.editNotes) redirect(`/ecrits/${id}`);
  return (
    <>
      <PageHeader
        eyebrow={<Link href={`/ecrits/${id}`} className="hover:underline">Retour à l&apos;écrit</Link>}
        title="Notes et informations du rendez-vous"
        description={`Dossier ${ws.caseReference}`}
      />
      {ws.content && (
        <Alert tone="warning" className="mb-6" title="Modifier les notes relance la vérification">
          Le contenu actuel du rapport est conservé. Si vous choisissez « Générer », un nouveau projet remplacera le contenu actuel (les versions précédentes restent consultables dans l&apos;historique).
        </Alert>
      )}
      <DocumentForm
        mode="edit"
        documentId={id}
        action={updateInputsAction}
        defaults={{ ...ws.input, type: ws.type, authorName: ws.authorName }}
      />
    </>
  );
}
