"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/session";
import { toActionError } from "@/lib/errors";
import { addCaseFileMember, createCaseFile, removeCaseFileMember, setCaseFileArchived } from "@/lib/services/case-files";
import type { FormState } from "./auth";

async function actor() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?expire=1");
  return user;
}
const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");

export async function createCaseFileAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor();
  let id: string;
  try {
    const cf = await createCaseFile(user, { reference: str(fd, "reference"), childAlias: str(fd, "childAlias"), serviceName: str(fd, "serviceName") }, (await requestMeta()).ip);
    id = cf.id;
  } catch (e) {
    return toActionError(e);
  }
  const then = str(fd, "then");
  redirect(then === "ecrit" ? `/ecrits/nouveau?dossier=${id}` : `/dossiers/${id}`);
}

export async function addMemberAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await actor();
  try {
    await addCaseFileMember(user, str(fd, "caseFileId"), str(fd, "userId"));
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/dossiers/${str(fd, "caseFileId")}`);
  return { ok: true };
}

export async function removeMemberAction(fd: FormData) {
  const user = await actor();
  await removeCaseFileMember(user, str(fd, "caseFileId"), str(fd, "userId"));
  revalidatePath(`/dossiers/${str(fd, "caseFileId")}`);
}

export async function archiveCaseFileAction(fd: FormData) {
  const user = await actor();
  await setCaseFileArchived(user, str(fd, "caseFileId"), str(fd, "archived") === "1");
  revalidatePath(`/dossiers/${str(fd, "caseFileId")}`);
}
