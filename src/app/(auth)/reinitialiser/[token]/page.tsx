import type { Metadata } from "next";
import { resetPasswordAction } from "@/app/actions/auth";
import { NewPasswordForm } from "@/components/password-form";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Nouveau mot de passe</h2>
      <p className="mt-1 mb-6 text-sm text-slate-600">Toutes vos sessions ouvertes seront fermées.</p>
      <NewPasswordForm action={resetPasswordAction} token={token} submitLabel="Enregistrer le mot de passe" />
    </div>
  );
}
