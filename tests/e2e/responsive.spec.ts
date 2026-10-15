import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("le tableau de bord et le formulaire sont utilisables sur tablette", async ({ page }) => {
  await login(page, "educatrice@demo.rapportenfance.fr");
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Nouvel écrit" }).click();
  await expect(page.getByRole("heading", { name: "Nouvel écrit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Générer mon écrit professionnel" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
