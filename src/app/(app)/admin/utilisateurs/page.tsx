import type { Metadata } from "next";
import { requireUserWith } from "@/lib/auth/guard";
import { canManageUsers } from "@/lib/auth/permissions";
import { listOrgUsers } from "@/lib/services/admin";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badges";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { revokeInvitationAction } from "@/app/actions/admin";
import { InviteForm, UserRowForm } from "./forms";

export const metadata: Metadata = { title: "Utilisateurs" };

export default async function UsersPage() {
  const user = await requireUserWith(canManageUsers);
  const { users, invitations } = await listOrgUsers(user);
  return (
    <>
      <PageHeader title="Utilisateurs" description="Inscription sur invitation : chaque personne choisit elle-même son mot de passe. Un compte désactivé perd immédiatement ses sessions." />
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title={`Comptes (${users.length})`} />
            <ul className="divide-y divide-slate-100">
              {users.map((u) => (
                <li key={u.id} className="space-y-2 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900">{u.fullName}</p>
                    <span className="text-sm text-slate-500">{u.email}</span>
                    {!u.isActive && <Badge tone="red">Désactivé</Badge>}
                    {u.lockedUntil && u.lockedUntil > new Date() && <Badge tone="amber">Verrouillé</Badge>}
                    <span className="ml-auto text-xs text-slate-400">{u.lastLoginAt ? `Dernière connexion ${fmtDateTime(u.lastLoginAt)}` : "Jamais connecté"}</span>
                  </div>
                  <UserRowForm user={u} self={u.id === user.id} />
                </li>
              ))}
            </ul>
          </Card>
          {invitations.length > 0 && (
            <Card>
              <CardHeader title="Invitations en attente" />
              <ul className="divide-y divide-slate-100">
                {invitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <span className="font-medium">{i.fullName}</span>
                    <span className="text-slate-500">{i.email}</span>
                    <span className="text-xs text-slate-400">expire le {fmtDate(i.expiresAt)}</span>
                    <form action={revokeInvitationAction} className="ml-auto">
                      <input type="hidden" name="invitationId" value={i.id} />
                      <button type="submit" className="text-sm font-medium text-err-700 hover:underline">Révoquer</button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <Card>
          <CardHeader title="Inviter un utilisateur" />
          <CardBody>
            <InviteForm />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
