import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, FilePen, FilePlus2, FileSearch, FolderOpen, ShieldCheck, ArrowRight } from "lucide-react";
import { requireCaseUser } from "@/lib/auth/guard";
import { dashboard } from "@/lib/services/documents";
import { Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badges";
import { getTemplate } from "@/lib/domain/document-types";
import { fmtDate, fmtRelative } from "@/lib/format";
import type { Status } from "@/lib/domain/workflow";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function DashboardPage() {
  const user = await requireCaseUser();
  const data = (await dashboard(user))!;
  const firstName = user.fullName.split(" ")[0];
  const tiles = [
    { label: "Mes brouillons", value: data.drafts, href: `/ecrits?status=DRAFT&authorId=${user.id}`, icon: FilePen, tone: "text-slate-700 bg-slate-100" },
    { label: "Mes écrits à vérifier", value: data.toReview, href: `/ecrits?status=TO_REVIEW&authorId=${user.id}`, icon: FileSearch, tone: "text-amber-700 bg-amber-50" },
    {
      label: data.validationMode === "SUPERVISOR" && user.roles.includes("VALIDATOR") ? "En attente de ma validation" : "Relus, en attente de validation",
      value: data.toValidate,
      href: "/ecrits?status=REVIEWED",
      icon: ClipboardCheck,
      tone: "text-sky-700 bg-sky-50",
    },
    { label: "Validés (30 derniers jours)", value: data.validated, href: "/ecrits?status=VALIDATED", icon: ShieldCheck, tone: "text-green-700 bg-green-50" },
  ];
  return (
    <>
      <PageHeader
        title={`Bonjour ${firstName}`}
        description="Retrouvez vos écrits en cours et démarrez un nouvel écrit à partir de vos notes."
        actions={
          <>
            <LinkButton href="/dossiers/nouveau" variant="secondary">
              <FolderOpen className="size-4" aria-hidden /> Nouveau dossier
            </LinkButton>
            <LinkButton href="/ecrits/nouveau">
              <FilePlus2 className="size-4" aria-hidden /> Nouvel écrit
            </LinkButton>
          </>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-200 hover:shadow">
            <div className="flex items-center justify-between">
              <span className={`rounded-lg p-2 ${t.tone}`}>
                <t.icon className="size-5" aria-hidden />
              </span>
              <ArrowRight className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
            </div>
            <p className="mt-4 text-3xl font-semibold tabular-nums text-slate-900">{t.value}</p>
            <p className="mt-1 text-sm text-slate-600">{t.label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title="Activité récente" description="Les derniers écrits modifiés dans vos dossiers." actions={<LinkButton href="/ecrits" variant="ghost" size="sm">Tout voir</LinkButton>} />
          {data.recent.length === 0 ? (
            <EmptyState
              icon={<FilePlus2 className="size-6" />}
              title="Aucun écrit pour le moment"
              description="Créez un dossier puis un premier écrit à partir de vos notes d'entretien."
              action={<LinkButton href="/ecrits/nouveau">Créer un écrit</LinkButton>}
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recent.map((d) => (
                <li key={d.id}>
                  <Link href={`/ecrits/${d.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{getTemplate(d.type).label}</p>
                      <p className="text-sm text-slate-500">
                        Dossier {d.caseFile.reference} · rendez-vous du {fmtDate(d.meetingDate)} · {d.authorName}
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
            <CardHeader title="Raccourcis" />
            <CardBody className="space-y-2">
              <LinkButton href="/ecrits/nouveau" className="w-full justify-start" variant="secondary">
                <FilePlus2 className="size-4" aria-hidden /> Rédiger à partir de mes notes
              </LinkButton>
              <LinkButton href="/dossiers" className="w-full justify-start" variant="secondary">
                <FolderOpen className="size-4" aria-hidden /> Mes dossiers ({data.caseFiles})
              </LinkButton>
              <LinkButton href={`/ecrits?status=DRAFT&authorId=${user.id}`} className="w-full justify-start" variant="secondary">
                <FilePen className="size-4" aria-hidden /> Reprendre un brouillon
              </LinkButton>
            </CardBody>
          </Card>
          <Card className="border-brand-100 bg-brand-50/50">
            <CardBody>
              <p className="text-sm font-semibold text-brand-900">Rappel</p>
              <p className="mt-1 text-sm leading-relaxed text-brand-900/80">
                L&apos;outil propose un projet d&apos;écrit à partir de vos notes. Il ne remplace pas votre appréciation : chaque document doit être relu, corrigé et validé avant tout export définitif.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
