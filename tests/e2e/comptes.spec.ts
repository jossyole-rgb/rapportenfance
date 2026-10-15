import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

/**
 * Invitation d'un nouvel utilisateur (fictif) puis mot de passe oublié, par l'interface.
 * Sans SMTP configuré, les e-mails sont écrits dans .dev-mailbox/ (serveur local uniquement).
 */
async function lastMailTo(email: string): Promise<string> {
  const dir = path.join(process.cwd(), ".dev-mailbox");
  // même nettoyage du nom que src/lib/mailer.ts
  const suffix = `${email.replace(/[^a-z0-9@.]/gi, "_")}.txt`;
  for (let i = 0; i < 20; i++) {
    const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(suffix)).sort();
    if (files.length) return readFile(path.join(dir, files[files.length - 1]!), "utf8");
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Aucun e-mail pour ${email}`);
}

test("invitation, création du compte, mot de passe oublié et nouvelle connexion", async ({ page }) => {
  const email = `invite-${Date.now()}@demo.rapportenfance.fr`;
  const first = "Invite-Fictif-2026!";
  const second = "Nouveau-Fictif-2026?";

  await login(page, "admin@demo.rapportenfance.fr");
  await page.goto("/admin/utilisateurs");
  await page.fill("#fullName", "Personne Fictive");
  await page.fill("#email", email);
  await page.getByRole("button", { name: "Inviter" }).click();
  const link = (await page.locator("code").filter({ hasText: "/invitation/" }).innerText()).trim();
  await expect(page.getByText(email)).toBeVisible();
  await logout(page);

  // acceptation : mot de passe trop faible refusé, puis compte créé
  await page.goto(new URL(link).pathname);
  await page.fill("#password", "faible");
  await page.fill("#confirm", "faible");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.fill("#password", first);
  await page.fill("#confirm", first);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.waitForURL(/connexion\?compte=1/);
  // le lien d'invitation est à usage unique
  await page.goto(new URL(link).pathname);
  await expect(page.getByText(/invalide|expiré|utilisée/i).first()).toBeVisible();

  // mot de passe oublié : réponse identique pour un compte inconnu
  await page.goto("/mot-de-passe-oublie");
  await page.fill("#email", "inconnu@demo.rapportenfance.fr");
  await page.getByRole("button", { name: "Recevoir un lien de réinitialisation" }).click();
  const generic = await page.getByRole("status").innerText();
  await page.goto("/mot-de-passe-oublie");
  await page.fill("#email", email);
  await page.getByRole("button", { name: "Recevoir un lien de réinitialisation" }).click();
  await expect(page.getByRole("status")).toHaveText(generic);

  const mail = await lastMailTo(email);
  const resetPath = /\/reinitialiser\/[\w-]+/.exec(mail)?.[0];
  expect(resetPath).toBeTruthy();
  await page.goto(resetPath!);
  await page.fill("#password", second);
  await page.fill("#confirm", second);
  await page.getByRole("button", { name: "Enregistrer le mot de passe" }).click();
  await page.waitForURL(/connexion\?reinitialise=1/);

  // l'ancien mot de passe ne fonctionne plus, le nouveau oui
  await page.fill("#email", email);
  await page.fill("#password", first);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Adresse e-mail ou mot de passe incorrect.")).toBeVisible();
  // l'adresse saisie est conservée après un échec
  await expect(page.locator("#email")).toHaveValue(email);
  await page.fill("#password", second);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/tableau-de-bord/);
});
