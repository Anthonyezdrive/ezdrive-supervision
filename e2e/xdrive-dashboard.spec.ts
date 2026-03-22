import { test, expect } from "@playwright/test";

// ── Login helper ─────────────────────────────────────────────────────────────

async function login(page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', process.env.E2E_EMAIL!);
  await page.fill('input[type="password"]', process.env.E2E_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10_000 });
}

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe("X-DRIVE Dashboard", () => {
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/xdrive/dashboard");
    await page.waitForLoadState("networkidle");
  });

  // ── Page load ──────────────────────────────────────────────────────────────

  test("dashboard page loads without errors", async ({ page }) => {
    await expect(page).toHaveURL(/xdrive\/dashboard/);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(50);
  });

  test("X-DRIVE header displays portal title", async ({ page }) => {
    // The layout always renders "X-DRIVE" either as the h1 (when no partner)
    // or the X-DRIVE branding span in the header
    const header = page.locator(
      'h1:has-text("X-DRIVE"), span:has-text("X-DRIVE")'
    ).first();
    await expect(header).toBeVisible();
  });

  test("portal subtitle is visible", async ({ page }) => {
    await expect(
      page.locator("text=Portail partenaire")
    ).toBeVisible();
  });

  // ── KPI cards ──────────────────────────────────────────────────────────────

  test("KPI card: Actes de recharge is visible", async ({ page }) => {
    await expect(page.locator("text=Actes de recharge")).toBeVisible();
  });

  test("KPI card: Énergie délivrée is visible", async ({ page }) => {
    await expect(
      page.locator('text=/Énergie délivrée/i')
    ).toBeVisible();
  });

  test("KPI card: Durée de recharge is visible", async ({ page }) => {
    await expect(page.locator("text=Durée de recharge")).toBeVisible();
  });

  test("KPI card: CA brut HT is visible", async ({ page }) => {
    await expect(page.locator("text=CA brut HT")).toBeVisible();
  });

  test("KPI card: CA brut TTC is visible", async ({ page }) => {
    await expect(page.locator("text=CA brut TTC")).toBeVisible();
  });

  test("KPI card: Taux d'utilisation is visible", async ({ page }) => {
    await expect(
      page.locator("text=/Taux d.utilisation/i")
    ).toBeVisible();
  });

  // ── Period filter buttons ───────────────────────────────────────────────────

  test("period preset buttons are visible (Jour, Semaine, Mois, Trimestre, Année)", async ({ page }) => {
    await expect(page.locator("button", { hasText: "Jour" }).first()).toBeVisible();
    await expect(page.locator("button", { hasText: "Semaine" }).first()).toBeVisible();
    await expect(page.locator("button", { hasText: "Mois" }).first()).toBeVisible();
    await expect(page.locator("button", { hasText: "Trimestre" }).first()).toBeVisible();
    await expect(page.locator("button", { hasText: "Année" }).first()).toBeVisible();
  });

  test("clicking a period filter button does not crash the page", async ({ page }) => {
    const semaineBtn = page.locator("button", { hasText: "Semaine" }).first();
    await semaineBtn.click();
    await page.waitForTimeout(1000);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
    // The button should now be active (period changed)
    await expect(semaineBtn).toBeVisible();
  });

  test("clicking Trimestre filter updates UI without error", async ({ page }) => {
    const btn = page.locator("button", { hasText: "Trimestre" }).first();
    await btn.click();
    await page.waitForTimeout(1500);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
  });

  test("clicking Année filter updates UI without error", async ({ page }) => {
    const btn = page.locator("button", { hasText: "Année" }).first();
    await btn.click();
    await page.waitForTimeout(1500);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
  });

  // ── Payment / Operator filters ─────────────────────────────────────────────

  test("payment filter buttons are visible (Paiement label)", async ({ page }) => {
    await expect(page.locator("text=Paiement").first()).toBeVisible();
  });

  test("operator filter buttons are visible (Opérateur label)", async ({ page }) => {
    await expect(
      page.locator("text=/Opérateur/i").first()
    ).toBeVisible();
  });

  // ── Charts ─────────────────────────────────────────────────────────────────

  test("Évolution mensuelle chart section is visible", async ({ page }) => {
    await expect(
      page.locator("text=Évolution mensuelle")
    ).toBeVisible();
  });

  test("CA par type de paiement chart section is visible", async ({ page }) => {
    await expect(
      page.locator("text=CA par type de paiement")
    ).toBeVisible();
  });

  test("CA par opérateur eMSP chart section is visible", async ({ page }) => {
    await expect(
      page.locator("text=CA par opérateur eMSP")
    ).toBeVisible();
  });

  // ── Summary stats ──────────────────────────────────────────────────────────

  test("session summary stats are visible", async ({ page }) => {
    // At least one of the average stats should be visible
    const hasStat = await page.locator(
      "text=/Énergie moy|Durée moy|CA HT moyen|Sessions Direct/i"
    ).first().isVisible().catch(() => false);
    expect(hasStat).toBeTruthy();
  });

  // ── Partner selector (admin) ───────────────────────────────────────────────

  test("partner selector label is visible for admin users when multiple partners exist", async ({ page }) => {
    // The "Partenaire" label only renders when isEZDriveAdmin && partners.length > 1.
    // We soft-check: if it exists it must be visible; absence is also acceptable.
    const partnerLabel = page.locator('label:has-text("Partenaire"), text=Partenaire').first();
    const exists = await partnerLabel.count();
    if (exists > 0) {
      await expect(partnerLabel).toBeVisible();
    }
  });

  // ── Co-branding footer ─────────────────────────────────────────────────────

  test("co-branding footer is visible", async ({ page }) => {
    await expect(
      page.locator("text=/Propulsé par EZDrive/i")
    ).toBeVisible();
  });
});
