"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/session";
import { toActionError } from "@/lib/errors";
import {
  archiveDocument,
  confirmClaim,
  createDocument,
  deleteDocument,
  generateDocument,
  markReviewed,
  reopenDocument,
  restoreVersion,
  saveDocumentContent,
  updateDocumentInputs,
  validateDocument,
} from "@/lib/services/documents";
import type { FormState } from "./auth";

async function actor() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?expire=1");
  return user;
}
const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
const ip = async () => (await requestMeta()).ip;

const FORM_FIELDS = ["authorJobTitle", "serviceName", "meetingDate", "meetingTime", "meetingLocation", "interviewType", "purpose", "attendees", "recipient", "notes"] as const;
const formInput = (fd: FormData) => Object.fromEntries(FORM_FIELDS.map((k) => [k, str(fd, k)]));

/** Création de l'écrit, puis génération immédiate si demandé (« Générer mon écrit professionnel »). */
export async function createDocumentAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor();
  let id: string;
  try {
    const doc = await createDocument(user, { ...formInput(fd), caseFileId: str(fd, "caseFileId"), type: str(fd, "type") }, await ip());
    id = doc.id;
    if (str(fd, "intent") === "generate") await generateDocument(user, id, await ip());
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/ecrits/${id}`);
}

export async function updateInputsAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor();
  const id = str(fd, "documentId");
  try {
    await updateDocumentInputs(user, id, formInput(fd), await ip());
    if (str(fd, "intent") === "generate") await generateDocument(user, id, await ip());
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/ecrits/${id}`);
}

export async function generateAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor();
  const id = str(fd, "documentId");
  try {
    await generateDocument(user, id, await ip());
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/ecrits/${id}`);
  return { ok: true, message: "Projet d'écrit généré." };
}

export type SaveResult = { ok: true; version: number; unchanged?: boolean } | { ok: false; error: string };

export async function saveContentAction(documentId: string, payload: { baseVersion: number; sections: Array<{ key: string; text: string }>; changeSummary?: string }): Promise<SaveResult> {
  const user = await actor();
  try {
    const res = await saveDocumentContent(user, documentId, payload, await ip());
    revalidatePath(`/ecrits/${documentId}`);
    return { ok: true, version: res.version, unchanged: res.unchanged };
  } catch (e) {
    return toActionError(e);
  }
}

export async function confirmClaimAction(documentId: string, claimText: string, note: string): Promise<SaveResult> {
  const user = await actor();
  try {
    const res = await confirmClaim(user, documentId, claimText, note, await ip());
    revalidatePath(`/ecrits/${documentId}`);
    return { ok: true, version: res.version };
  } catch (e) {
    return toActionError(e);
  }
}

export async function markReviewedAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor();
  const id = str(fd, "documentId");
  try {
    await markReviewed(user, id, fd.getAll("checklist").filter((v): v is string => typeof v === "string"), await ip());
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/ecrits/${id}`);
  return { ok: true, message: "Relecture enregistrée. Le document peut maintenant être validé." };
}

export async function validateAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor();
  const id = str(fd, "documentId");
  try {
    await validateDocument(user, id, { confirmation: str(fd, "confirmation") === "on", version: Number(str(fd, "version")) }, await ip());
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/ecrits/${id}`);
  return { ok: true, message: "Document validé. L'export définitif est disponible." };
}

export async function reopenAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor();
  const id = str(fd, "documentId");
  try {
    await reopenDocument(user, id, await ip());
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/ecrits/${id}`);
  return { ok: true, message: "Document rouvert : la validation précédente a été annulée." };
}

export async function restoreVersionAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor();
  const id = str(fd, "documentId");
  try {
    await restoreVersion(user, id, Number(str(fd, "version")), await ip());
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/ecrits/${id}`);
}

export async function archiveAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor();
  const id = str(fd, "documentId");
  try {
    await archiveDocument(user, id, await ip());
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/ecrits/${id}`);
  return { ok: true, message: "Document archivé." };
}

export async function deleteAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor();
  const id = str(fd, "documentId");
  const back = str(fd, "back");
  try {
    await deleteDocument(user, id, await ip());
  } catch (e) {
    return toActionError(e);
  }
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/ecrits");
}
