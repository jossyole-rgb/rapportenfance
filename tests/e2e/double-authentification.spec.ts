import { expect, test } from "@playwright/test";
import { currentStep, totpAt } from "../../src/lib/security/totp";
import { DEMO_PASSWORD, login, logout } from "./helpers";

/**
 * Double authentification sur un compte de démonstration : activation volontaire, connexion avec code,
 * connexion avec code de secours, puis réinitialisation par l'administrateur (remet le compte dans son état initial).
 */
const USER = "assistant.social@demo.rapportenfance.fr";
const code = (secret: string, offset = 0) => totpAt(secret, currentStep() + offset);

async function passwordStep(page: import("@playwright/test").Page) {
  await page.goto("/connexion");
  await page.fill("#email", USER);
  await page.fill("#password", DEMO_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/connexion\/verification/);
}

test("activation, connexion en deux étapes, code de secours et réinitialisation par l'administrateur", async ({ page }) => {
  await login(page, USER);
  await page.goto("/compte");
  await page.getByRole("link", { name: "Activer la double authentification" }).click();
  const secret = (await page.getByTestId("totp-secret").innerText()).replace(/\s/g, "");
  await page.fill("#mfa-code", code(secret));
  await page.getByRole("button", { name: "Activer" }).click();
  const list = page.getByRole("list", { name: "Codes de secours" }).locator("li");
  await expect(list).toHaveCount(8);
  const codes = await list.allInnerTexts();
  await page.getByRole("link", { name: /continuer/ }).click();
  await page.waitForURL(/tableau-de-bord/);
  await logout(page);

  // le mot de passe seul ne suffit plus
  await passwordStep(page);
  await page.goto("/tableau-de-bord");
  await expect(page).toHaveURL(/\/connexion/);
  await passwordStep(page);
  await page.fill("#mfa-code", "000000");
  await page.getByRole("button", { name: /Vérifier/ }).click();
  await expect(page.getByText("Code incorrect ou expiré.")).toBeVisible();
  await page.fill("#mfa-code", code(secret, 1));
  await page.getByRole("button", { name: /Vérifier/ }).click();
  await page.waitForURL(/tableau-de-bord/);
  await logout(page);

  // code de secours, utilisable une seule fois
  await passwordStep(page);
  await page.fill("#mfa-code", codes[0]!);
  await page.getByRole("button", { name: /Vérifier/ }).click();
  await page.waitForURL(/\/compte\?codes-restants=7/);
  await expect(page.getByText("Il vous reste 7 code(s) de secours.", { exact: false })).toBeVisible();
  await logout(page);

  // l'administrateur de l'établissement réinitialise (téléphone perdu)
  await login(page, "admin@demo.rapportenfance.fr");
  await page.goto("/admin/utilisateurs");
  const row = page.getByRole("listitem").filter({ hasText: USER });
  await expect(row.getByText("Double authentification", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: /Réinitialiser la double authentification/ }).click();
  await expect(row.getByText("Sans double authentification")).toBeVisible();
  await logout(page);

  // retour à l'état initial : connexion par mot de passe seul (l'établissement de démonstration ne l'exige pas)
  await login(page, USER);
  await expect(page).toHaveURL(/tableau-de-bord/);
});
