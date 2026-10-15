import { expect, test } from "@playwright/test";
import { login, logout } from "./helpers";

/**
 * Parcours complet sur données fictives :
 * notes -> génération -> contrôle des sources -> correction -> relecture -> validation par la cheffe de service -> export.
 * Prérequis : base de développement initialisée avec « npm run db:seed ».
 */
test("parcours complet de rédaction, validation et export", async ({ page }) => {
  const ref = `E2E-${Date.now()}`;
  await login(page, "educatrice@demo.rapportenfance.fr");
  await expect(page.getByRole("heading", { name: /Bonjour Camille/ })).toBeVisible();

  // Dossier
  await page.goto("/dossiers/nouveau?then=ecrit");
  await page.fill("#reference", ref);
  await page.fill("#childAlias", "Lucas");
  await page.getByRole("button", { name: "Créer le dossier" }).click();
  await page.waitForURL(/ecrits\/nouveau/);

  // Écrit
  await page.selectOption("#type", "VISITE_DOMICILE");
  await page.fill("#meetingTime", "14:00");
  await page.fill("#meetingLocation", "Domicile de la mère");
  await page.fill("#purpose", "Point sur la scolarité");
  await page.fill("#attendees", "La mère, Lucas");
  await page.getByRole("button", { name: "Insérer l'exemple fictif" }).click();
  await page.getByRole("button", { name: "Générer mon écrit professionnel" }).click();
  await expect(page.getByText("Projet d'écrit généré : relecture obligatoire")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#section-EXPRESSION_ENFANT")).toHaveValue(/Lucas indique : professeur crie beaucoup\./);

  // Export définitif indisponible avant validation
  await page.getByRole("button", { name: "Exporter" }).click();
  await expect(page.getByText("L'export définitif sera disponible après validation humaine.")).toBeVisible();
  const forbidden = await page.request.get(page.url().replace(/\/ecrits\/(\w+).*/, "/api/ecrits/$1/export?format=pdf&mode=final"));
  expect(forbidden.status()).toBe(403);
  await page.getByRole("button", { name: "Exporter" }).click();

  // Affirmation non étayée -> rouge
  const obs = page.locator("#section-OBSERVATIONS");
  await obs.fill((await obs.inputValue()) + "\nLa relation mère-enfant apparaît sécurisante.");
  await expect(page.getByRole("button", { name: /« La relation mère-enfant apparaît sécurisante\. »/ })).toBeVisible();
  await page.getByRole("button", { name: /« La relation mère-enfant apparaît sécurisante\. »/ }).click();
  await expect(page.locator("blockquote", { hasText: "La relation mère-enfant apparaît sécurisante." })).toBeVisible();
  await expect(page.getByText(/Appréciation absente des notes/)).toBeVisible();

  // Correction : suppression du passage et reformulation fidèle d'une observation
  await obs.fill((await obs.inputValue()).replace("\nLa relation mère-enfant apparaît sécurisante.", "").replace("Logement propre.", "Le logement est propre."));
  await expect(page.getByText(/Sélectionnez un passage signalé/)).toBeVisible();
  await page.fill("#changeSummary", "Relecture des observations");
  await page.getByRole("button", { name: "Enregistrer une nouvelle version" }).click();
  await expect(page.getByText(/Version 2 enregistrée|version 2/).first()).toBeVisible();

  // Relecture
  await page.getByRole("tab", { name: /Contrôle qualité/ }).click();
  await expect(page.getByText("Indicateur de qualité rédactionnelle (indicatif)")).toBeVisible();
  await expect(page.getByText(/score de conformité/i)).toHaveCount(0);
  for (const cb of await page.locator('input[name="checklist"]').all()) await cb.check();
  await page.getByRole("button", { name: "Relecture terminée" }).click();
  await expect(page.getByText(/Relu par Camille Martin/)).toBeVisible();
  // L'auteur ne peut pas valider (mode chef de service)
  await expect(page.getByText(/attend la validation d'un validateur/)).toBeVisible();
  const docUrl = page.url();
  await logout(page);

  // Validation par la cheffe de service
  await login(page, "cheffe.service@demo.rapportenfance.fr");
  await page.goto(docUrl);
  await page.getByRole("tab", { name: /Contrôle qualité/ }).click();
  await page.getByLabel(/Je confirme avoir relu ce document/).check();
  await page.getByRole("button", { name: /Valider la version/ }).click();
  await expect(page.getByText(/Validé par Sophie Lambert/)).toBeVisible();

  // Export définitif PDF et DOCX
  await page.getByRole("button", { name: "Exporter" }).click();
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "PDF", exact: true }).click()]);
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  expect(pdf.suggestedFilename()).not.toContain("BROUILLON");
  await page.getByRole("button", { name: "Exporter" }).click();
  const [docx] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Word (DOCX)" }).click()]);
  expect(docx.suggestedFilename()).toMatch(/\.docx$/);
  await page.reload();
  await expect(page.getByText("Exporté").first()).toBeVisible();
});

test("un professionnel d'un autre établissement ne voit pas les dossiers", async ({ page }) => {
  await login(page, "educateur@mecs.demo.rapportenfance.fr");
  await page.goto("/dossiers");
  await expect(page.getByText("D-2026-0042")).toHaveCount(0);
  await expect(page.getByText("M-001")).toBeVisible();
});

test("l'administrateur technique n'a pas accès aux écrits", async ({ page }) => {
  await login(page, "tech@demo.rapportenfance.fr");
  await expect(page).toHaveURL(/plateforme/);
  await page.goto("/ecrits");
  await expect(page).toHaveURL(/acces-refuse/);
});

test("une page protégée redirige vers la connexion", async ({ page }) => {
  await page.goto("/tableau-de-bord");
  await expect(page).toHaveURL(/connexion/);
});
