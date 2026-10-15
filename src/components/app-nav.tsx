"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Building2,
  FileClock,
  FilePlus2,
  FolderOpen,
  LayoutDashboard,
  Menu,
  ScrollText,
  Settings,
  Trash2,
  UserCircle,
  Users,
  X,
  LogOut,
} from "lucide-react";
import { Logo } from "./logo";
import { cn } from "./ui/cn";
import { logoutAction } from "@/app/actions/auth";

type NavItem = { href: string; label: string; icon: keyof typeof ICONS };
const ICONS = { LayoutDashboard, FolderOpen, FilePlus2, FileClock, Users, Settings, ScrollText, Trash2, Building2, UserCircle };

export function AppNav({
  sections,
  user,
}: {
  sections: Array<{ title?: string; items: NavItem[] }>;
  user: { fullName: string; roleLabel: string; organizationName: string | null };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav aria-label="Navigation principale" className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Link href="/" onClick={() => setOpen(false)}>
          <Logo inverted />
        </Link>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {sections.map((section, i) => (
          <div key={i}>
            {section.title && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-brand-200/60">{section.title}</p>}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active ? "bg-white/12 text-white" : "text-brand-100/80 hover:bg-white/6 hover:text-white",
                      )}
                    >
                      <Icon className="size-[18px] shrink-0" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-semibold text-white" aria-hidden>
            {user.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.fullName}</p>
            <p className="truncate text-xs text-brand-100/70">{user.roleLabel}</p>
          </div>
        </div>
        <div className="mt-1 flex gap-1">
          <Link href="/compte" onClick={() => setOpen(false)} className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand-100/80 hover:bg-white/6 hover:text-white">
            <UserCircle className="size-4" aria-hidden /> Mon compte
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand-100/80 hover:bg-white/6 hover:text-white">
              <LogOut className="size-4" aria-hidden /> Déconnexion
            </button>
          </form>
        </div>
      </div>
    </nav>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Logo />
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Ouvrir le menu" aria-expanded={open}>
          <Menu className="size-6" />
        </button>
      </div>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 bg-brand-900 lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-brand-900 shadow-xl">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-5 rounded-lg p-1.5 text-brand-100 hover:bg-white/10" aria-label="Fermer le menu">
              <X className="size-5" />
            </button>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
