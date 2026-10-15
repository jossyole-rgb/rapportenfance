import type { Page } from "@playwright/test";
export const DEMO_PASSWORD = "Demo-RapportEnfance-2026!";
export async function login(page: Page, email: string) {
  await page.goto("/connexion");
  await page.fill("#email", email);
  await page.fill("#password", DEMO_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"));
}
export async function logout(page: Page) {
  await page.getByRole("button", { name: "Déconnexion" }).first().click();
  await page.waitForURL(/connexion/);
}
