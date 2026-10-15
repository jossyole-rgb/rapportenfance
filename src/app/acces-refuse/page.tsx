import { LinkButton } from "@/components/ui/button";
export default function AccessDenied() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Accès refusé</h1>
        <p className="mt-2 text-slate-600">Votre rôle ne permet pas d&apos;accéder à cette page. Si vous pensez qu&apos;il s&apos;agit d&apos;une erreur, contactez l&apos;administrateur de votre établissement.</p>
        <LinkButton href="/" className="mt-6">Retour à l&apos;accueil</LinkButton>
      </div>
    </main>
  );
}
