import type { Metadata } from "next";
import { requireUserWith } from "@/lib/auth/guard";
import { canManageOrganizations } from "@/lib/auth/permissions";
import { listOrganizations } from "@/lib/services/admin";
import { toggleOrganizationAction } from "@/app/actions/admin";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badges";
import { fmtDate } from "@/lib/format";
import { OrgForm } from "./org-form";

export const metadata: Metadata = { title: "Organisations" };

export default async function PlatformPage() {
  const user = await requireUserWith(canManageOrganizations);
  const orgs = await listOrganizations(user);
  return (
    <>
      <PageHeader title="Organisations" description="Administration technique. Ce rôle n'a accès à aucun dossier ni à aucun écrit." />
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title={`Organisations (${orgs.length})`} />
          <ul className="divide-y divide-slate-100">
            {orgs.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <span className="font-medium text-slate-900">{o.name}</span>
                <span className="font-mono text-xs text-slate-500">{o.slug}</span>
                <span className="text-slate-500">{o.users} utilisateur(s) · créée le {fmtDate(o.createdAt)}</span>
                {!o.isActive && <Badge tone="red">Suspendue</Badge>}
                <form action={toggleOrganizationAction} className="ml-auto">
                  <input type="hidden" name="orgId" value={o.id} />
                  <input type="hidden" name="isActive" value={o.isActive ? "0" : "1"} />
                  <button type="submit" className="text-sm font-medium text-brand-700 hover:underline">{o.isActive ? "Suspendre" : "Réactiver"}</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Nouvelle organisation" />
          <CardBody><OrgForm /></CardBody>
        </Card>
      </div>
    </>
  );
}
