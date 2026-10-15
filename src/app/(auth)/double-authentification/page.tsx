import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getUserForMfaSetup } from "@/lib/auth/guard";
import { getMfaStatus, startMfaEnrollment } from "@/lib/services/mfa-service";
import { formatSecret, otpauthUri } from "@/lib/security/totp";
import { confirmMfaEnrollmentAction } from "@/app/actions/mfa";
import { logoutAction } from "@/app/actions/auth";
import { MfaCodeForm } from "@/components/mfa-forms";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Activer la double authentification" };

export default async function MfaSetupPage() {
  const user = await getUserForMfaSetup();
  if (!user) redirect("/connexion");
  const status = await getMfaStatus(user.id);
  if (status.enabled) redirect("/compte");
  const { secret } = await startMfaEnrollment(user.id);
  // QR code généré localement (aucun service tiers) ; il ne contient que le secret et l'adresse e-mail
  const svg = await QRCode.toString(otpauthUri(secret, user.email), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  const qr = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Activer la double authentification</h2>
      <p className="mt-1 text-sm text-slate-600">
        À chaque connexion, un code à 6 chiffres affiché par une application sur votre téléphone vous sera demandé en plus du mot de passe.
      </p>
      <div className="mt-6 space-y-5">
        {status.required && (
          <Alert tone="info">Votre établissement exige la double authentification. Elle doit être activée avant d&apos;accéder à l&apos;application.</Alert>
        )}
        <ol className="space-y-5 text-sm text-slate-700">
          <li>
            <p className="font-medium text-slate-900">1. Installez une application d&apos;authentification</p>
            <p className="mt-1">Par exemple celle fournie par votre établissement, ou une application du magasin de votre téléphone compatible « TOTP ».</p>
          </li>
          <li>
            <p className="font-medium text-slate-900">2. Scannez ce QR code avec l&apos;application</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code d'activation de la double authentification" width={176} height={176} className="mt-3 rounded-lg border border-slate-200 bg-white p-2" />
            <p className="mt-3">Ou saisissez cette clé manuellement :</p>
            <p className="mt-1 select-all break-all rounded-md bg-slate-100 px-3 py-2 font-mono text-sm" data-testid="totp-secret">
              {formatSecret(secret)}
            </p>
          </li>
          <li>
            <p className="font-medium text-slate-900">3. Saisissez le code affiché pour confirmer</p>
          </li>
        </ol>
        <MfaCodeForm action={confirmMfaEnrollmentAction} submitLabel="Activer" codesNextHref="/" />
        <form action={logoutAction}>
          <button type="submit" className="text-sm font-medium text-slate-600 hover:underline">
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}
