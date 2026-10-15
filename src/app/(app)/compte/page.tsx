import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/guard";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { changePasswordAction } from "@/app/actions/auth";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { NewPasswordForm } from "@/components/password-form";

export const metadata: Metadata = { title: "Mon compte" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="max-w-3xl">
      <PageHeader title="Mon compte" />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Profil" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <div><dt className="text-xs text-slate-500">Nom</dt><dd>{user.fullName}</dd></div>
              <div><dt className="text-xs text-slate-500">E-mail</dt><dd>{user.email}</dd></div>
              <div><dt className="text-xs text-slate-500">Fonction</dt><dd>{user.jobTitle ?? "-"}</dd></div>
              <div><dt className="text-xs text-slate-500">Établissement</dt><dd>{user.organizationName ?? "-"}</dd></div>
              <div><dt className="text-xs text-slate-500">Rôles</dt><dd>{user.roles.map((r) => ROLE_LABELS[r]).join(", ")}</dd></div>
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Changer de mot de passe" description="Vos autres sessions seront fermées." />
          <CardBody>
            <NewPasswordForm action={changePasswordAction} withCurrent submitLabel="Modifier le mot de passe" />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
