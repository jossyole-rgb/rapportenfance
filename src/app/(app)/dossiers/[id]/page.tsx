import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, FilePlus2, FileText, UserMinus } from "lucide-react";
import { requireCaseUser } from "@/lib/auth/guard";
import { getCaseFileDetail, listAssignableUsers } from "@/lib/services/case-files";
import { AppError } from "@/lib/errors";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { Button, LinkButton } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badges";
import { getTemplate } from "@/lib/domain/document-types";
import { fmtDate, fmtRelative } from "@/lib/format";
import { archiveCaseFileAction, removeMemberAction } from "@/app/actions/cases";
import { AddMemberForm } from "./members";
import type { Status } from "@/lib/domain/workflow";

export const metadata: Metadata = { title: "Dossier" };

export default async function CaseFilePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCaseUser();
  const { id } = await params;
  let cf;
  try {
    cf = await getCaseFileDetail(user, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const users = cf.canManageMembers ? await listAssignableUsers(user) : [];
  const candidates = users.filter((u) => !cf.members.some((m) => m.id === u.id));
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/dossiers" className="hover:underline">Dossiers</Link>}
        title={
          <span className="flex flex-wrap items-center gap-3">
            Dossier {cf.reference}
            {cf.status === "ARCHIVED" && <Badge>Archivé</Badge>}
          </span>
        }
        description={[cf.childAlias && `Prénom utilisé dans les notes : ${cf.childAlias}`, cf.serviceName, `créé le ${fmtDate(cf.createdAt)}`].filter(Boolean).join(" · ")}
        actions={
          cf.status === "ACTIVE" && cf.isMember ? (
            <LinkButton href={`/ecrits/nouveau?dossier=${cf.id}`}>
              <FilePlus2 className="size-4" aria-hidden /> Nouvel écrit
            </LinkButton>
          ) : undefined
        }
      />
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title="Écrits du dossier" description={`${cf.documents.length} écrit(s)`} />
          {cf.documents.length === 0 ? (
            <EmptyState icon={<FileText className="size-6" />} title="Aucun écrit dans ce dossier" description="Créez un écrit à partir de vos notes d'entretien ou de visite." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {cf.documents.map((d) => (
                <li key={d.id}>
                  <Link href={`/ecrits/${d.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{getTemplate(d.type).label}</p>
                      <p className="text-sm text-slate-500">
                        Rendez-vous du {fmtDate(d.meetingDate)} · {d.authorName} · version {d.currentVersion}
                      </p>
                    </div>
                    <StatusBadge status={d.status as Status} />
                    <span className="w-24 text-right text-xs text-slate-400">{fmtRelative(d.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Membres du dossier" description="Seuls les membres (et les validateurs) accèdent aux écrits." />
            <CardBody className="space-y-4">
              <ul className="space-y-2">
                {cf.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      <span className="font-medium text-slate-800">{m.fullName}</span>
                      {m.jobTitle && <span className="text-slate-500"> · {m.jobTitle}</span>}
                    </span>
                    {cf.canManageMembers && cf.members.length > 1 && (
                      <form action={removeMemberAction}>
                        <input type="hidden" name="caseFileId" value={cf.id} />
                        <input type="hidden" name="userId" value={m.id} />
                        <button type="submit" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Retirer ${m.fullName} du dossier`}>
                          <UserMinus className="size-4" />
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
              {cf.canManageMembers && <AddMemberForm caseFileId={cf.id} candidates={candidates} />}
            </CardBody>
          </Card>
          {cf.canManageMembers && (
            <Card>
              <CardBody>
                <form action={archiveCaseFileAction}>
                  <input type="hidden" name="caseFileId" value={cf.id} />
                  <input type="hidden" name="archived" value={cf.status === "ACTIVE" ? "1" : "0"} />
                  <Button type="submit" variant="secondary" className="w-full">
                    {cf.status === "ACTIVE" ? <Archive className="size-4" aria-hidden /> : <ArchiveRestore className="size-4" aria-hidden />}
                    {cf.status === "ACTIVE" ? "Archiver le dossier" : "Réactiver le dossier"}
                  </Button>
                </form>
                <p className="mt-2 text-xs text-slate-500">Un dossier archivé reste consultable mais n&apos;accepte plus de nouvel écrit.</p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
