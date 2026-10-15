"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { acceptInvitation, authenticate, changePassword, logoutSession, requestPasswordReset, resetPassword } from "@/lib/services/auth-service";
import { createMfaChallenge, verifyMfaChallenge } from "@/lib/services/mfa-service";
import { clearSessionCookie, createSessionRecord, getCurrentSession, MFA_COOKIE, requestMeta, setSessionCookie } from "@/lib/auth/session";
import { getCurrentUser, MFA_SETUP_PATH } from "@/lib/auth/guard";
import { needsMfaSetup } from "@/lib/auth/mfa-policy";
import { toActionError } from "@/lib/errors";

export type FormState =
  | { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; message?: string; codes?: string[]; email?: string }
  | undefined;

const isProd = () => process.env.NODE_ENV === "production";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

const homeFor = (roles: string[]) =>
  roles.includes("PROFESSIONAL") || roles.includes("VALIDATOR") ? "/tableau-de-bord" : roles.includes("ORG_ADMIN") ? "/admin/utilisateurs" : "/plateforme";

const safeNext = (next: string | null | undefined) => (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null);

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const meta = await requestMeta();
  let target: string;
  try {
    const user = await authenticate(str(fd, "email"), str(fd, "password"), meta);
    const next = safeNext(str(fd, "next"));
    if (user.totpEnabledAt) {
      // Mot de passe correct : le second facteur est demandé avant toute ouverture de session
      const { token, expiresAt } = await createMfaChallenge(user.id, next);
      (await cookies()).set(MFA_COOKIE(), token, { httpOnly: true, secure: isProd(), sameSite: "strict", path: "/", expires: expiresAt });
      target = "/connexion/verification";
    } else {
      const { token, expiresAt } = await createSessionRecord(user.id, meta.userAgent);
      await setSessionCookie(token, expiresAt);
      target = needsMfaSetup(user) ? MFA_SETUP_PATH : next ?? homeFor(user.roles);
    }
  } catch (e) {
    // l'adresse saisie est conservée dans le formulaire (React vide les champs après l'action)
    return { ...toActionError(e), email: str(fd, "email").slice(0, 200) };
  }
  redirect(target);
}

export async function verifyMfaAction(_: FormState, fd: FormData): Promise<FormState> {
  const meta = await requestMeta();
  const jar = await cookies();
  let target: string;
  try {
    const result = await verifyMfaChallenge(jar.get(MFA_COOKIE())?.value ?? "", str(fd, "code"), meta);
    jar.delete(MFA_COOKIE());
    const { token, expiresAt } = await createSessionRecord(result.user.id, meta.userAgent);
    await setSessionCookie(token, expiresAt);
    target = safeNext(result.nextPath) ?? homeFor(result.user.roles);
    if (result.method === "recovery") target = `/compte?codes-restants=${result.remainingRecoveryCodes}`;
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
