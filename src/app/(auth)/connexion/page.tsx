import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guard";
import { Alert } from "@/components/ui/alert";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (await getCurrentUser()) redirect("/");
  const sp = await searchParams;
  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Connexion</h2>
      <p className="mt-1 text-sm text-slate-600">Accès réservé aux professionnels habilités de votre établissement.</p>
      <div className="mt-6 space-y-4">
        {sp.deconnecte && <Alert tone="success">Vous êtes déconnecté(e).</Alert>}
        {sp.reinitialise && <Alert tone="success">Votre mot de passe a été modifié. Vous pouvez vous connecter.</Alert>}
        {sp.compte && <Alert tone="success">Votre compte est créé. Vous pouvez vous connecter.</Alert>}
        {sp.expire && <Alert tone="warning">Votre session a expiré. Reconnectez-vous.</Alert>}
        <LoginForm next={sp.next} />
      </div>
      <p className="mt-8 text-xs leading-relaxed text-slate-500">
        L&apos;inscription se fait sur invitation de l&apos;administrateur de votre établissement. Pour la démonstration, utilisez uniquement des données fictives.
      </p>
    </div>
  );
}
