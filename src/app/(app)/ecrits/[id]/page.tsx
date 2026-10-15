import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NotebookPen, ShieldAlert } from "lucide-react";
import { requireCaseUser } from "@/lib/auth/guard";
import { getDocumentWorkspace } from "@/lib/services/documents";
import { AppError } from "@/lib/errors";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badges";
import { Alert } from "@/components/ui/alert";
import { getTemplate } from "@/lib/domain/document-types";
import { fmtDate } from "@/lib/format";
import { WorkflowStepper } from "@/components/workspace/workflow-stepper";
import { Workspace } from "@/components/workspace/workspace";
import { ArchiveDeleteActions, ExportMenu, GenerateForm } from "@/components/workspace/document-actions";

export const metadata: Metadata = { title: "Écrit" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCaseUser();
  const { id } = await params;
  let ws;
  try {
    ws = await getDocumentWorkspace(user, id, { logView: true });
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const template = getTemplate(ws.type);
  return (
    <>
      <PageHeader
        eyebrow={
          <span>
            <Link href={`/dossiers/${ws.caseFileId}`} className="hover:underline">Dossier {ws.caseReference}</Link>
            <span className="mx-1.5 text-slate-300">/</span>Rendez-vous du {fmtDate(ws.input.meetingDate)}
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {template.label}
            <StatusBadge status={ws.status} />
            {ws.currentVersion > 0 && <span className="text-sm font-normal text-slate-500">version {ws.currentVersion}</span>}
          </span>
        }
        description={`Rédigé par ${ws.authorName}`}
        actions={
          <>
            {ws.permissions.editNotes && (
              <LinkButton href={`/ecrits/${ws.id}/sources`} variant="secondary">
                <NotebookPen className="size-4" aria-hidden /> Notes et informations
              </LinkButton>
            )}
            <ExportMenu documentId={ws.id} final={ws.permissions.exportFinal} draft={ws.permissions.exportDraft} />
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <WorkflowStepper status={ws.status} />
        <ArchiveDeleteActions documentId={ws.id} canArchive={ws.permissions.archive} canDelete={ws.permissions.delete} back={`/dossiers/${ws.caseFileId}`} />
      </div>

      {!ws.content || !ws.evaluation ? (
        <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader title="Notes enregistrées" description="Le projet d'écrit n'a pas encore été généré." />
            <CardBody>
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-mono text-[13px] text-slate-800">{ws.input.notes}</pre>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Étape suivante" />
            <CardBody className="space-y-4">
              <p className="text-sm text-slate-600">
                Le moteur va analyser vos notes, classer chaque élément (faits, observations, propos, actions…), construire le document selon la trame « {template.label} » puis vérifier chaque affirmation au regard de vos notes.
              </p>
              {ws.permissions.generate ? <GenerateForm documentId={ws.id} regenerate={false} /> : <Alert tone="info">Seul l&apos;auteur ou un validateur peut lancer la génération.</Alert>}
            </CardBody>
          </Card>
        </div>
      ) : (
        <>
          {ws.status === "GENERATED" && (
            <Alert tone="warning" className="mb-5" title="Projet d'écrit généré : relecture obligatoire">
              Ce document est une proposition construite à partir de vos notes. Vérifiez chaque rubrique, en particulier les passages signalés en orange ou en rouge, avant de le faire valider.
            </Alert>
          )}
          {ws.status === "ARCHIVED" && (
            <Alert tone="info" className="mb-5" title="Document archivé">Consultation seule. La suppression relève de la politique de conservation de l&apos;établissement.</Alert>
          )}
          {(ws.status === "TO_REVIEW" || ws.status === "GENERATED") && ws.permissions.generate && (
            <div className="mb-5 flex flex-wrap items-center justify-end gap-3">
              <span className="flex items-center gap-1.5 text-xs text-slate-500"><ShieldAlert className="size-3.5" aria-hidden />Vous avez modifié vos notes ? Vous pouvez régénérer le projet.</span>
              <GenerateForm documentId={ws.id} regenerate />
            </div>
          )}
          <Workspace
            documentId={ws.id}
            type={ws.type}
            status={ws.status}
            currentVersion={ws.currentVersion}
            content={ws.content}
            analysis={ws.analysis}
            segments={ws.evaluation.segments}
            input={ws.input}
            engine={ws.engine}
            validationMode={ws.validationMode}
            validatedAt={ws.validatedAt}
            validatorName={ws.validator?.fullName ?? null}
            reviewedAt={ws.reviewedAt}
            reviewerName={ws.reviewer?.fullName ?? null}
            authorName={ws.authorName}
            createdAt={ws.createdAt}
            updatedAt={ws.updatedAt}
            versions={ws.versions}
            permissions={{ edit: ws.permissions.edit, review: ws.permissions.review, validate: ws.permissions.validate, reopen: ws.permissions.reopen }}
          />
        </>
      )}
    </>
  );
}
