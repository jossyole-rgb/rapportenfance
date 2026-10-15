import "server-only";
import { redirect } from "next/navigation";
import { getCurrentSession } from "./session";
import { canUseCaseContent, type Actor, type RoleKey } from "./permissions";

export type CurrentUser = Actor & {
  email: string;
  fullName: string;
  jobTitle: string | null;
  serviceName: string | null;
  organizationName: string | null;
  sessionId: string;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  const u = session.user;
  return {
    id: u.id,
    organizationId: u.organizationId,
    roles: u.roles as RoleKey[],
    email: u.email,
    fullName: u.fullName,
    jobTitle: u.jobTitle,
    serviceName: u.serviceName,
    organizationName: u.organization?.name ?? null,
    sessionId: session.id,
  };
}

/** Pages protégées : redirige vers la connexion si aucune session valide. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  return user;
}

export async function requireUserWith(check: (a: Actor) => boolean): Promise<CurrentUser> {
  const user = await requireUser();
  if (!check(user)) redirect("/acces-refuse");
  return user;
}

export const requireCaseUser = () => requireUserWith(canUseCaseContent);
