import { LinkButton } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main className="grid min-h-[70vh] place-items-center px-6">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-brand-700">Erreur 404</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Page introuvable ou inaccessible</h1>
        <p className="mt-2 text-slate-600">Cette ressource n&apos;existe pas ou vous n&apos;avez pas les droits pour la consulter.</p>
        <LinkButton href="/" className="mt-6">Retour à l&apos;accueil</LinkButton>
      </div>
    </main>
  );
}
