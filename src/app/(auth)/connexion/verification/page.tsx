import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MFA_COOKIE } from "@/lib/auth/session";
import { getMfaChallenge } from "@/lib/services/mfa-service";
import { verifyMfaAction } from "@/app/actions/auth";
import { MfaCodeForm } from "@/components/mfa-forms";

export const metadata: Metadata = { title: "Vérification en deux étapes" };

export default async function MfaVerificationPage() {
  const challenge = await getMfaChallenge((await cookies()).get(MFA_COOKIE())?.value);
  if (!challenge) redirect("/connexion?expire=1");
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Vérification en deux étapes</h2>
      <p className="mt-1 text-sm text-slate-600">
        Saisissez le code affiché par votre application d&apos;authentification. Si vous n&apos;avez plus votre téléphone, utilisez un code de secours.
      </p>
      <div className="mt-6">
        <MfaCodeForm action={verifyMfaAction} submitLabel="Vérifier et se connecter" allowRecovery autoFocus />
      </div>
      <p className="mt-6 text-sm text-slate-600">
        Plus de téléphone ni de code de secours ? Demandez à l&apos;administrateur de votre établissement de réinitialiser votre double authentification.{" "}
        <Link href="/connexion" className="font-medium text-brand-700 hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </div>
  );
}
