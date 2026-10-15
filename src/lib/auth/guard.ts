import "server-only";
import { redirect } from "next/navigation";
import { getCurrentSession } from "./session";
import { canUseCaseContent, type Actor, type RoleKey } from "./permissions";
import { needsMfaSetup } from "./mfa-policy";

export const MFA_SETUP_PATH = "/double-authentification";

export type CurrentUser = Actor & {
  email: string;
  fullName: string;
  jobTitle: string | null;
  serviceName: string | null;
  organizationName: string | null;
  sessionId: string;
};

/**
 * Utilisateur de la requête. Retourne null si aucune session valide, ou si la double authentification
 * est obligatoire et pas encore configurée : aucune page ni action ne lui est alors accessible,
 * à l'exception de la page de configuration (getUserForMfaSetup).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getCurrentSession();
  if (!session || needsMfaSetup(session.user)) return null;
  return toCurrentUser(session);
}

/** Réservé à la page de configuration de la double authentification. */
export async function getUserForMfaSetup(): Promise<CurrentUser | null> {
  const session = await getCurrentSession();
  return session ? toCurrentUser(session) : null;
}

function toCurrentUser(session: NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>): CurrentUser {
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

/** Pages protégées : redirige vers la connexion si aucune session valide, ou vers la configuration de la double authentification. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    const session = await getCurrentSession();
    redirect(session && needsMfaSetup(session.user) ? MFA_SETUP_PATH : "/connexion");
  }
  return user;
}

export async function requireUserWith(check: (a: Actor) => boolean): Promise<CurrentUser> {
  const user = await requireUser();
  if (!check(user)) redirect("/acces-refuse");
  return user;
}

export const requireCaseUser = () => requireUserWith(canUseCaseContent);
