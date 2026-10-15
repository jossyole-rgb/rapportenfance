"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, getUserForMfaSetup } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/session";
import { adminResetMfa, confirmMfaEnrollment, disableMfa, regenerateRecoveryCodes } from "@/lib/services/mfa-service";
import { toActionError } from "@/lib/errors";
import type { FormState } from "./auth";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

export async function confirmMfaEnrollmentAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await getUserForMfaSetup();
  if (!user) redirect("/connexion");
  try {
    const codes = await confirmMfaEnrollment(user.id, str(fd, "code"), await requestMeta());
    return { ok: true, codes, message: "Double authentification activée." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function regenerateRecoveryCodesAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  try {
    const codes = await regenerateRecoveryCodes(user.id, str(fd, "code"), await requestMeta());
    return { ok: true, codes, message: "Nouveaux codes de secours générés. Les anciens ne fonctionnent plus." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function disableMfaAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  try {
    await disableMfa(user.id, str(fd, "password"), str(fd, "code"), await requestMeta());
  } catch (e) {
    return toActionError(e);
  }
  redirect("/compte?mfa-desactivee=1");
}

export async function adminResetMfaAction(fd: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  await adminResetMfa(user, str(fd, "userId"), await requestMeta());
  revalidatePath("/admin/utilisateurs");
}
