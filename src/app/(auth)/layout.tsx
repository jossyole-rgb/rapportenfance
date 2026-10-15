import { ShieldCheck, FileCheck2, UserCheck } from "lucide-react";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-brand-900 px-12 py-10 text-white lg:flex lg:flex-col">
        <Logo inverted />
        <div className="my-auto max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Transformez vos notes de terrain en un projet d&apos;écrit structuré, factuel et traçable.
          </h1>
          <p className="mt-4 text-brand-100/90">Vous gardez la maîtrise complète du document final.</p>
          <ul className="mt-10 space-y-5 text-sm">
            <li className="flex gap-3">
              <FileCheck2 className="size-5 shrink-0 text-brand-200" aria-hidden />
              <span>Chaque affirmation est rapprochée de vos notes : vous voyez ce qui est étayé et ce qui doit être vérifié.</span>
            </li>
            <li className="flex gap-3">
              <UserCheck className="size-5 shrink-0 text-brand-200" aria-hidden />
              <span>Aucun écrit n&apos;est exportable sans relecture et validation par un professionnel habilité.</span>
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="size-5 shrink-0 text-brand-200" aria-hidden />
              <span>Données chiffrées, accès par établissement et par dossier, actions journalisées.</span>
            </li>
          </ul>
        </div>
        <p className="text-xs text-brand-100/60">
          Outil d&apos;assistance à la rédaction : il ne se substitue ni à l&apos;appréciation professionnelle ni aux procédures de votre établissement.
        </p>
      </aside>
      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
