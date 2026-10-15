"use server";

import { redirect } from "next/navigation";
import { acceptInvitation, authenticate, changePassword, logoutSession, requestPasswordReset, resetPassword } from "@/lib/services/auth-service";
import { clearSessionCookie, createSessionRecord, getCurrentSession, requestMeta, setSessionCookie } from "@/lib/auth/session";
import { getCurrentUser } from "@/lib/auth/guard";
import { toActionError } from "@/lib/errors";

export type FormState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; message?: string } | undefined;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

const homeFor = (roles: string[]) =>
  roles.includes("PROFESSIONAL") || roles.includes("VALIDATOR") ? "/tableau-de-bord" : roles.includes("ORG_ADMIN") ? "/admin/utilisateurs" : "/plateforme";

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const meta = await requestMeta();
  let target: string;
  try {
    const user = await authenticate(str(fd, "email"), str(fd, "password"), meta);
    const { token, expiresAt } = await createSessionRecord(user.id, meta.userAgent);
    await setSessionCookie(token, expiresAt);
    const next = str(fd, "next");
    target = next.startsWith("/") && !next.startsWith("//") ? next : homeFor(user.roles);
  } catch (e) {
    return toActionError(e);
  }
  redirect(target);
}

export async function logoutAction() {
  const session = await getCurrentSession();
  if (session) await logoutSession(session.id, session.user, await requestMeta());
  await clearSessionCookie();
  redirect("/connexion?deconnecte=1");
}

export async function forgotPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await requestPasswordReset(str(fd, "email"), await requestMeta(), process.env.APP_URL || "http://localhost:3000");
    return { ok: true, message: "Si un compte actif correspond à cette adresse, un e-mail contenant un lien de réinitialisation vient d'être envoyé." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function resetPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  if (str(fd, "password") !== str(fd, "confirm")) return { error: "Les deux mots de passe ne correspondent pas.", fieldErrors: { confirm: "Ne correspond pas." } };
  try {
    await resetPassword(str(fd, "token"), str(fd, "password"), await requestMeta());
  } catch (e) {
    return toActionError(e);
  }
  redirect("/connexion?reinitialise=1");
}

export async function acceptInvitationAction(_: FormState, fd: FormData): Promise<FormState> {
  if (str(fd, "password") !== str(fd, "confirm")) return { error: "Les deux mots de passe ne correspondent pas.", fieldErrors: { confirm: "Ne correspond pas." } };
  try {
    await acceptInvitation(str(fd, "token"), str(fd, "password"), await requestMeta());
  } catch (e) {
    return toActionError(e);
  }
  redirect("/connexion?compte=1");
}

export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  if (str(fd, "password") !== str(fd, "confirm")) return { error: "Les deux mots de passe ne correspondent pas.", fieldErrors: { confirm: "Ne correspond pas." } };
  try {
    await changePassword(user.id, str(fd, "current"), str(fd, "password"), await requestMeta(), user.sessionId);
    return { ok: true, message: "Mot de passe modifié. Vos autres sessions ont été fermées." };
  } catch (e) {
    return toActionError(e);
  }
}
