"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/session";
import { canManageUsers } from "@/lib/auth/permissions";
import { forbidden, toActionError } from "@/lib/errors";
import { createInvitation } from "@/lib/services/auth-service";
import { createOrganization, revokeInvitation, setOrganizationActive, updateOrgSettings, updateOrgUser } from "@/lib/services/admin";
import { deleteDocument } from "@/lib/services/documents";
import type { FormState } from "./auth";

async function actor() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?expire=1");
  return user;
}
const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");

export async function inviteUserAction(_: FormState, fd: FormData): Promise<FormState & { link?: string }> {
  const user = await actor();
  try {
    if (!canManageUsers(user)) throw forbidden();
    const res = await createInvitation(
      { id: user.id, organizationId: user.organizationId! },
      { email: str(fd, "email"), fullName: str(fd, "fullName"), jobTitle: str(fd, "jobTitle"), roles: fd.getAll("roles") as Array<"PROFESSIONAL" | "VALIDATOR" | "ORG_ADMIN"> },
      process.env.APP_URL || "http://localhost:3000",
      await requestMeta(),
    );
    revalidatePath("/admin/utilisateurs");
    return { ok: true, message: "Invitation créée et envoyée par e-mail.", link: res.link };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateUserAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor();
  try {
    await updateOrgUser(user, str(fd, "userId"), { roles: fd.getAll("roles"), jobTitle: str(fd, "jobTitle"), isActive: str(fd, "isActive") === "on" });
    revalidatePath("/admin/utilisateurs");
    return { ok: true, message: "Utilisateur mis à jour." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function revokeInvitationAction(fd: FormData) {
  const user = await actor();
  await revokeInvitation(user, str(fd, "invitationId"));
  revalidatePath("/admin/utilisateurs");
}

export async function updateOrgSettingsAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor();
  try {
    await updateOrgSettings(user, {
      ...Object.fromEntries(["name", "headerLine1", "headerLine2", "headerLine3", "validationMode", "retentionDays", "auditRetentionDays"].map((k) => [k, str(fd, k)])),
      mfaRequired: fd.get("mfaRequired") === "on",
    });
    revalidatePath("/admin/etablissement");
    return { ok: true, message: "Paramètres enregistrés." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteArchivedAction(fd: FormData) {
  const user = await actor();
  await deleteDocument(user, str(fd, "documentId"), (await requestMeta()).ip);
  revalidatePath("/admin/conservation");
}

export async function createOrganizationAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor();
  try {
    await createOrganization(user, Object.fromEntries(["name", "slug", "adminEmail", "adminName", "adminPassword"].map((k) => [k, str(fd, k)])));
    revalidatePath("/plateforme");
    return { ok: true, message: "Organisation et administrateur créés." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function toggleOrganizationAction(fd: FormData) {
  const user = await actor();
  await setOrganizationActive(user, str(fd, "orgId"), str(fd, "isActive") === "1");
  revalidatePath("/plateforme");
}
