import type { Metadata } from "next";
import Link from "next/link";
import { acceptInvitationAction } from "@/app/actions/auth";
import { NewPasswordForm } from "@/components/password-form";
import { getInvitation } from "@/lib/services/auth-service";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Activer mon compte" };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await getInvitation(token);
  if (!inv) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Invitation invalide</h2>
        <Alert tone="warning">Cette invitation est invalide, a expiré ou a déjà été utilisée. Demandez une nouvelle invitation à l&apos;administrateur de votre établissement.</Alert>
        <Link href="/connexion" className="text-sm font-medium text-brand-700 hover:underline">Retour à la connexion</Link>
      </div>
    );
  }
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Activer mon compte</h2>
      <p className="mt-1 mb-6 text-sm text-slate-600">
        {inv.fullName}, vous êtes invité(e) à rejoindre <strong>{inv.organization.name}</strong> ({inv.email}). Choisissez votre mot de passe.
      </p>
      <NewPasswordForm action={acceptInvitationAction} token={token} submitLabel="Créer mon compte" />
    </div>
  );
}
