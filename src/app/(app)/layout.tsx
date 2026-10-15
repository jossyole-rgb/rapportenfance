import { requireUser } from "@/lib/auth/guard";
import { ROLE_LABELS, canManageOrganizations, canManageUsers, canUseCaseContent } from "@/lib/auth/permissions";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const sections: Parameters<typeof AppNav>[0]["sections"] = [];
  if (canUseCaseContent(user)) {
    sections.push({
      items: [
        { href: "/tableau-de-bord", label: "Tableau de bord", icon: "LayoutDashboard" },
        { href: "/ecrits/nouveau", label: "Nouvel écrit", icon: "FilePlus2" },
        { href: "/dossiers", label: "Dossiers", icon: "FolderOpen" },
        { href: "/ecrits", label: "Écrits et historique", icon: "FileClock" },
      ],
    });
  }
  if (canManageUsers(user)) {
    sections.push({
      title: "Établissement",
      items: [
        { href: "/admin/utilisateurs", label: "Utilisateurs", icon: "Users" },
        { href: "/admin/etablissement", label: "Paramètres", icon: "Settings" },
        { href: "/admin/conservation", label: "Conservation", icon: "Trash2" },
        { href: "/admin/journal", label: "Journal d'audit", icon: "ScrollText" },
      ],
    });
  }
  if (canManageOrganizations(user)) {
    sections.push({ title: "Plateforme", items: [{ href: "/plateforme", label: "Organisations", icon: "Building2" }] });
  }
  const roleLabel = user.roles.map((r) => ROLE_LABELS[r]).join(" · ");
  return (
    <div className="min-h-screen">
      <AppNav sections={sections} user={{ fullName: user.fullName, roleLabel, organizationName: user.organizationName }} />
      <div className="lg:pl-64">
        <div className="border-b border-slate-200 bg-white/80 px-4 py-2 text-xs text-slate-500 sm:px-8">
          {user.organizationName ?? "Administration technique"} · Environnement de démonstration : n&apos;utilisez que des données fictives.
        </div>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
