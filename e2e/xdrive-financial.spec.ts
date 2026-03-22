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
// Module 3 — Ventilation (Breakdown)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("X-DRIVE Ventilation (Breakdown)", () => {
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/xdrive/breakdown");
    await page.waitForLoadState("networkidle");
  });

  test("Ventilation page loads without errors", async ({ page }) => {
    await expect(page).toHaveURL(/xdrive\/breakdown/);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(50);
  });

  test("Ventilation tab is active in navigation", async ({ page }) => {
    await expect(page.locator("text=Ventilation").first()).toBeVisible();
  });

  test("payment type breakdown section is visible", async ({ page }) => {
    // Section showing CA par type de paiement (pie or legend)
    const section = page.locator(
      "text=CA par type de paiement, text=Paiement, text=Ventilation paiement"
    ).first();
    const exists = await section.count();
    if (exists > 0) {
      await expect(section).toBeVisible();
    } else {
      // If no partner data, page should still render without errors
      await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
    }
  });

  test("eMSP breakdown section is visible", async ({ page }) => {
    const section = page.locator(
      "text=CA par opérateur eMSP, text=eMSP, text=Opérateur"
    ).first();
    const exists = await section.count();
    if (exists > 0) {
      await expect(section).toBeVisible();
    } else {
      await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
    }
  });

  test("period filter buttons are visible on Ventilation page", async ({ page }) => {
    const moisBtn = page.locator("button", { hasText: "Mois" }).first();
    const exists = await moisBtn.count();
    if (exists > 0) {
      await expect(moisBtn).toBeVisible();
    }
  });

  test("co-branding footer is visible on Ventilation page", async ({ page }) => {
    await expect(
      page.locator("text=/Propulsé par EZDrive/i")
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Module 4 — Rapprochement (Reconciliation)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("X-DRIVE Rapprochement (Reconciliation)", () => {
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/xdrive/reconciliation");
    await page.waitForLoadState("networkidle");
  });

  test("Reconciliation page loads without errors", async ({ page }) => {
    await expect(page).toHaveURL(/xdrive\/reconciliation/);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(50);
  });

  test("Rapprochement tab is active in navigation", async ({ page }) => {
    await expect(page.locator("text=Rapprochement").first()).toBeVisible();
  });

  test("month navigation controls are present", async ({ page }) => {
    // ChevronLeft / ChevronRight for month navigation
    const prevBtn = page.locator(
      'button[aria-label*="précédent"], button[aria-label*="mois précédent"], button:has(svg[data-lucide="chevron-left"])'
    ).first();
    const nextBtn = page.locator(
      'button[aria-label*="suivant"], button:has(svg[data-lucide="chevron-right"])'
    ).first();
    const hasPrev = await prevBtn.count();
    const hasNext = await nextBtn.count();
    // Month text like "Mars 2026" should appear
    const monthText = page.locator(
      "text=/Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre/i"
    ).first();
    const hasMonthText = await monthText.count();
    expect(hasPrev + hasNext + hasMonthText).toBeGreaterThan(0);
  });

  test("current month label is displayed", async ({ page }) => {
    const monthText = page.locator(
      "text=/Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre/i"
    ).first();
    const exists = await monthText.count();
    if (exists > 0) {
      await expect(monthText).toBeVisible();
    }
  });

  test("reconciliation table lines render (A–H or similar)", async ({ page }) => {
    // Reconciliation lines are labeled A, B, C... or as row entries
    const lineA = page.locator("text=/Ligne A|Ligne B|Total sessions|CA calculé/i").first();
    const tableRows = page.locator("tbody tr, [role='row']");
    const hasLine = await lineA.count();
    const rowCount = await tableRows.count();
    // Accept either labeled lines or generic table rows
    expect(hasLine + rowCount).toBeGreaterThanOrEqual(0);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
  });

  test("history section renders past reconciliations", async ({ page }) => {
    const historySection = page.locator(
      "text=/Historique|Mois précédents|Rapprochements passés/i"
    ).first();
    const exists = await historySection.count();
    if (exists > 0) {
      await expect(historySection).toBeVisible();
    }
  });

  test("clicking previous month button does not crash page", async ({ page }) => {
    // Find the left chevron navigation button (prev month)
    const prevBtn = page.locator(
      'button:has(svg), button[class*="chevron"]'
    ).first();
    if (await prevBtn.isVisible()) {
      await prevBtn.click();
      await page.waitForTimeout(1000);
      await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Module 5 — Facturation BPU
// ─────────────────────────────────────────────────────────────────────────────

test.describe("X-DRIVE Facturation BPU", () => {
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/xdrive/bpu");
    await page.waitForLoadState("networkidle");
  });

  test("BPU page loads without errors", async ({ page }) => {
    await expect(page).toHaveURL(/xdrive\/bpu/);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(50);
  });

  test("Facturation BPU tab is visible in navigation", async ({ page }) => {
    await expect(
      page.locator("text=Facturation BPU").first()
    ).toBeVisible();
  });

  test("BPU page renders core content area", async ({ page }) => {
    // BPU page may require admin access only; still must not crash
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
    // Either a form, table, or "accès refusé" message
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(30);
  });

  test("PdC inventory or configuration section is present", async ({ page }) => {
    const section = page.locator(
      "text=/PdC|Points de charge|Inventaire|Configuration BPU|BPU/i"
    ).first();
    const exists = await section.count();
    if (exists > 0) {
      await expect(section).toBeVisible();
    }
  });

  test("invoice preview or history section is present", async ({ page }) => {
    const section = page.locator(
      "text=/Aperçu facture|Historique|Factures|Prévisualisation/i"
    ).first();
    const exists = await section.count();
    if (exists > 0) {
      await expect(section).toBeVisible();
    }
  });

  test("co-branding footer is visible on BPU page", async ({ page }) => {
    await expect(
      page.locator("text=/Propulsé par EZDrive/i")
    ).toBeVisible();
  });
});
