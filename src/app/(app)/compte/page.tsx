import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/guard";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { getMfaStatus } from "@/lib/services/mfa-service";
import { fmtDate } from "@/lib/format";
import { changePasswordAction } from "@/app/actions/auth";
import { disableMfaAction, regenerateRecoveryCodesAction } from "@/app/actions/mfa";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { LinkButton } from "@/components/ui/button";
import { NewPasswordForm } from "@/components/password-form";
import { MfaCodeForm } from "@/components/mfa-forms";

export const metadata: Metadata = { title: "Mon compte" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const mfa = await getMfaStatus(user.id);
  const sp = await searchParams;
  const remaining = sp["codes-restants"];
  return (
    <div className="max-w-4xl">
      <PageHeader title="Mon compte" />
      <div className="mb-6 space-y-3">
        {remaining !== undefined && (
          <Alert tone="warning" title="Connexion avec un code de secours">
            Il vous reste {remaining} code(s) de secours. Si vous avez perdu votre téléphone, générez de nouveaux codes ou demandez la réinitialisation de votre double authentification.
          </Alert>
        )}
        {sp["mfa-desactivee"] && <Alert tone="success">Double authentification désactivée.</Alert>}
      </div>
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
        <Card>
          <CardHeader
            title="Double authentification"
            description={mfa.enabled ? `Active depuis le ${fmtDate(mfa.enabledAt!)} · ${mfa.remainingRecoveryCodes} code(s) de secours restant(s)` : "Un code de votre téléphone est demandé en plus du mot de passe."}
          />
          <CardBody>
            {mfa.enabled ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-600">Générer de nouveaux codes de secours (les anciens seront invalidés) :</p>
                <MfaCodeForm action={regenerateRecoveryCodesAction} submitLabel="Générer de nouveaux codes" variant="secondary" />
              </div>
            ) : (
              <LinkButton href="/double-authentification">Activer la double authentification</LinkButton>
            )}
          </CardBody>
        </Card>
        {mfa.enabled && (
          <Card>
            <CardHeader
              title="Désactiver la double authentification"
              description={mfa.required ? "Votre établissement l'exige : vous devrez la réactiver immédiatement (nouveau téléphone par exemple)." : "Déconseillé si vous traitez des données réelles."}
            />
            <CardBody>
              <MfaCodeForm action={disableMfaAction} submitLabel="Désactiver" withPassword variant="danger" />
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
