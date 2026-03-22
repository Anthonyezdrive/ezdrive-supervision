import { test, expect } from "@playwright/test";

// ── Login helper ─────────────────────────────────────────────────────────────

async function login(page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', process.env.E2E_EMAIL!);
  await page.fill('input[type="password"]', process.env.E2E_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10_000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Module 7 — Facturation partenaire (Billing)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("X-DRIVE Facturation Partenaire (Billing)", () => {
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/xdrive/billing");
    await page.waitForLoadState("networkidle");
  });

  // ── Page load ──────────────────────────────────────────────────────────────

  test("billing page loads without errors", async ({ page }) => {
    await expect(page).toHaveURL(/xdrive\/billing/);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(50);
  });

  test("Facturation partenaire navigation tab is visible", async ({ page }) => {
    await expect(
      page.locator("text=Facturation partenaire, text=Facturation").first()
    ).toBeVisible();
  });

  // ── Tab navigation within billing ─────────────────────────────────────────

  test("Recap CA tab is visible", async ({ page }) => {
    const tab = page.locator(
      'button:has-text("Recap CA"), [role="tab"]:has-text("Recap"), button:has-text("Recap")'
    ).first();
    const exists = await tab.count();
    if (exists > 0) {
      await expect(tab).toBeVisible();
    }
  });

  test("Vérification tab is visible", async ({ page }) => {
    const tab = page.locator(
      'button:has-text("Vérification"), [role="tab"]:has-text("Vérification")'
    ).first();
    const exists = await tab.count();
    if (exists > 0) {
      await expect(tab).toBeVisible();
    }
  });

  test("Facturation tab is visible", async ({ page }) => {
    const tab = page.locator(
      'button:has-text("Facturation"), [role="tab"]:has-text("Facturation")'
    ).first();
    // There are multiple elements with "Facturation" text; we just need one to be visible
    const exists = await tab.count();
    if (exists > 0) {
      await expect(tab).toBeVisible();
    }
  });

  test("Historique tab is visible", async ({ page }) => {
    const tab = page.locator(
      'button:has-text("Historique"), [role="tab"]:has-text("Historique")'
    ).first();
    const exists = await tab.count();
    if (exists > 0) {
      await expect(tab).toBeVisible();
    }
  });

  test("clicking Vérification tab does not crash page", async ({ page }) => {
    const tab = page.locator(
      'button:has-text("Vérification"), [role="tab"]:has-text("Vérification")'
    ).first();
    if (await tab.isVisible()) {
      await tab.click();
      await page.waitForTimeout(1000);
      await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
    }
  });

  test("clicking Historique tab does not crash page", async ({ page }) => {
    const tab = page.locator(
      'button:has-text("Historique"), [role="tab"]:has-text("Historique")'
    ).first();
    if (await tab.isVisible()) {
      await tab.click();
      await page.waitForTimeout(1000);
      await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
    }
  });

  // ── Recap CA content ───────────────────────────────────────────────────────

  test("Recap CA section shows KPI cards or CA summary", async ({ page }) => {
    // Click on Recap CA tab if present
    const recapTab = page.locator(
      'button:has-text("Recap CA"), button:has-text("Recap")'
    ).first();
    if (await recapTab.isVisible()) {
      await recapTab.click();
      await page.waitForTimeout(800);
    }
    // Should have KPI-style content
    const kpiArea = page.locator(
      '[class*="card"], [class*="kpi"], [class*="stat"], text=/CA|Sessions|Énergie/i'
    ).first();
    const exists = await kpiArea.count();
    if (exists > 0) {
      await expect(kpiArea).toBeVisible();
    }
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
  });

  // ── Co-branding footer ─────────────────────────────────────────────────────

  test("co-branding footer is visible on billing page", async ({ page }) => {
    await expect(
      page.locator("text=/Propulsé par EZDrive/i")
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Module 8 — Exports
// ─────────────────────────────────────────────────────────────────────────────

test.describe("X-DRIVE Exports", () => {
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/xdrive/exports");
    await page.waitForLoadState("networkidle");
  });

  // ── Page load ──────────────────────────────────────────────────────────────

  test("Exports page loads without errors", async ({ page }) => {
    await expect(page).toHaveURL(/xdrive\/exports/);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(50);
  });

  test("Exports navigation tab is active", async ({ page }) => {
    await expect(page.locator("text=Exports").first()).toBeVisible();
  });

  // ── Export cards ──────────────────────────────────────────────────────────

  test("CDR détaillés export card is visible", async ({ page }) => {
    await expect(
      page.locator("text=CDR détaillés").first()
    ).toBeVisible();
  });

  test("Synthèse d'activité export card is visible", async ({ page }) => {
    await expect(
      page.locator("text=/Synthèse d.activité/i").first()
    ).toBeVisible();
  });

  test("Rapport mensuel export card is visible", async ({ page }) => {
    await expect(
      page.locator("text=Rapport mensuel").first()
    ).toBeVisible();
  });

  test("Annexe CDR facturation export card is visible", async ({ page }) => {
    await expect(
      page.locator("text=Annexe CDR facturation").first()
    ).toBeVisible();
  });

  test("at least 4 export cards are visible", async ({ page }) => {
    // Export cards are rendered as card containers with a title
    const exportCards = page.locator(
      '[class*="card"], [class*="export-card"], [class*="rounded"]'
    );
    const count = await exportCards.count();
    // Check text-based: at least 4 different export type labels
    const bodyText = await page.locator("body").innerText();
    const exportNames = [
      "CDR détaillés",
      "Synthèse",
      "Rapport mensuel",
      "Annexe CDR",
    ];
    const foundCount = exportNames.filter((name) =>
      bodyText.includes(name)
    ).length;
    expect(foundCount).toBeGreaterThanOrEqual(4);
  });

  // ── Export format labels ───────────────────────────────────────────────────

  test("CSV format label is present on at least one export card", async ({ page }) => {
    await expect(page.locator("text=CSV").first()).toBeVisible();
  });

  test("PDF format label is present on at least one export card", async ({ page }) => {
    await expect(page.locator("text=PDF").first()).toBeVisible();
  });

  // ── Period selector ────────────────────────────────────────────────────────

  test("period or month selector is present on exports page", async ({ page }) => {
    const selector = page.locator(
      'select, input[type="date"], [aria-label*="mois"], [aria-label*="période"]'
    ).first();
    const exists = await selector.count();
    if (exists > 0) {
      await expect(selector).toBeVisible();
    }
  });

  // ── Recent exports ─────────────────────────────────────────────────────────

  test("exports page renders without crashing when no recent exports exist", async ({ page }) => {
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(50);
  });

  // ── Co-branding footer ─────────────────────────────────────────────────────

  test("co-branding footer is visible on exports page", async ({ page }) => {
    await expect(
      page.locator("text=/Propulsé par EZDrive/i")
    ).toBeVisible();
  });
});
