import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guard";
import { canUseCaseContent, canManageUsers } from "@/lib/auth/permissions";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  if (canUseCaseContent(user)) redirect("/tableau-de-bord");
  if (canManageUsers(user)) redirect("/admin/utilisateurs");
  redirect("/plateforme");
}
