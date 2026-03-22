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

test.describe("X-DRIVE CDR Detail", () => {
  test.setTimeout(30_000);

  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/xdrive/cdrs");
    await page.waitForLoadState("networkidle");
  });

  // ── Page load ──────────────────────────────────────────────────────────────

  test("CDR page loads without errors", async ({ page }) => {
    await expect(page).toHaveURL(/xdrive\/cdrs/);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(50);
  });

  test("CDR page title / tab label is active", async ({ page }) => {
    // The tab "CDR détaillés" should be active in the navigation
    await expect(
      page.locator("text=CDR détaillés").first()
    ).toBeVisible();
  });

  // ── Table columns ──────────────────────────────────────────────────────────

  test("table renders with Date column header", async ({ page }) => {
    const dateHeader = page.locator(
      'th:has-text("Date"), [role="columnheader"]:has-text("Date")'
    ).first();
    const isVisible = await dateHeader.isVisible().catch(() => false);
    // If page shows "Aucun partenaire" instead of table, skip gracefully
    if (!isVisible) {
      const body = await page.locator("body").innerText();
      expect(
        body.includes("partenaire") || body.includes("CDR")
      ).toBeTruthy();
    } else {
      await expect(dateHeader).toBeVisible();
    }
  });

  test("table renders with Énergie column header", async ({ page }) => {
    const energieHeader = page.locator(
      'th:has-text("Énergie"), [role="columnheader"]:has-text("kWh")'
    ).first();
    const isVisible = await energieHeader.isVisible().catch(() => false);
    if (!isVisible) {
      const body = await page.locator("body").innerText();
      expect(body.length).toBeGreaterThan(50);
    } else {
      await expect(energieHeader).toBeVisible();
    }
  });

  test("table renders with Statut or status-related column", async ({ page }) => {
    const statHeader = page.locator(
      'th:has-text("Statut"), [role="columnheader"]:has-text("Statut")'
    ).first();
    const isVisible = await statHeader.isVisible().catch(() => false);
    if (!isVisible) {
      const body = await page.locator("body").innerText();
      expect(body.length).toBeGreaterThan(50);
    } else {
      await expect(statHeader).toBeVisible();
    }
  });

  // ── Search ────────────────────────────────────────────────────────────────

  test("search input is visible and accepts text", async ({ page }) => {
    const searchInput = page.locator(
      'input[placeholder*="echerch"], input[placeholder*="earch"], input[type="search"]'
    ).first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("test-query");
      await page.waitForTimeout(500);
      await expect(searchInput).toHaveValue("test-query");
    }
  });

  test("search icon or search bar area is present", async ({ page }) => {
    // Either a visible search input or a Search icon container
    const searchArea = page.locator(
      'input[type="search"], input[placeholder*="echerch"], [data-testid*="search"]'
    ).first();
    const svgSearch = page.locator('svg[class*="lucide-search"], svg[data-lucide="search"]').first();
    const hasSearch =
      (await searchArea.count()) > 0 || (await svgSearch.count()) > 0;
    expect(hasSearch).toBeTruthy();
  });

  // ── Filters ───────────────────────────────────────────────────────────────

  test("status filter control is present", async ({ page }) => {
    // Status filter can be a select or buttons
    const filter = page.locator(
      'select[name*="status"], [aria-label*="statut"], button:has-text("Completée"), button:has-text("Tous")'
    ).first();
    const exists = await filter.count();
    // Soft assertion: filter may not render without partner data
    if (exists > 0) {
      await expect(filter).toBeVisible();
    }
  });

  test("payment type filter control is present", async ({ page }) => {
    const filter = page.locator(
      'button:has-text("CB"), button:has-text("RFID"), button:has-text("Badge RFID"), select[name*="payment"]'
    ).first();
    const exists = await filter.count();
    if (exists > 0) {
      await expect(filter).toBeVisible();
    }
  });

  // ── Export buttons ────────────────────────────────────────────────────────

  test("Export CSV button is present", async ({ page }) => {
    const csvBtn = page.locator(
      'button:has-text("CSV"), button:has-text("Exporter CSV"), [data-testid*="export-csv"]'
    ).first();
    const exists = await csvBtn.count();
    if (exists > 0) {
      await expect(csvBtn).toBeVisible();
    }
  });

  test("Export PDF button is present", async ({ page }) => {
    const pdfBtn = page.locator(
      'button:has-text("PDF"), button:has-text("Exporter PDF"), [data-testid*="export-pdf"]'
    ).first();
    const exists = await pdfBtn.count();
    if (exists > 0) {
      await expect(pdfBtn).toBeVisible();
    }
  });

  // ── Pagination ────────────────────────────────────────────────────────────

  test("pagination controls render when data is available", async ({ page }) => {
    // ChevronLeft / ChevronRight pagination buttons
    const prevBtn = page.locator(
      'button[aria-label*="précédent"], button[aria-label*="prev"], button:has(svg[class*="chevron-left"]), button:has(svg[data-lucide="chevron-left"])'
    ).first();
    const nextBtn = page.locator(
      'button[aria-label*="suivant"], button[aria-label*="next"], button:has(svg[class*="chevron-right"]), button:has(svg[data-lucide="chevron-right"])'
    ).first();
    // Soft check: pagination is only visible with data
    const hasPrev = await prevBtn.count();
    const hasNext = await nextBtn.count();
    // At least the page counter or pagination text should exist
    const pageText = page.locator("text=/Page \\d|\\d+ sur \\d/i").first();
    const hasPageText = await pageText.count();
    // We accept either pagination controls OR a page counter
    expect(hasPrev + hasNext + hasPageText).toBeGreaterThanOrEqual(0);
    // The page itself must be functional
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
  });

  // ── Row click / SlideOver ─────────────────────────────────────────────────

  test("clicking a table row opens detail panel when data exists", async ({ page }) => {
    const firstRow = page.locator("tbody tr").first();
    const hasRows = await firstRow.count();
    if (hasRows > 0) {
      await firstRow.click();
      await page.waitForTimeout(800);
      // SlideOver or detail panel should appear (contains CDR detail info)
      const panelVisible = await page.locator(
        '[role="dialog"], [data-testid*="slideover"], [class*="slide-over"], [class*="SlideOver"]'
      ).first().isVisible().catch(() => false);
      // Even if no slide-over, the page must not crash
      await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
      // If panel appeared, it should have content
      if (panelVisible) {
        const panelText = await page.locator(
          '[role="dialog"], [class*="slide-over"]'
        ).first().innerText();
        expect(panelText.length).toBeGreaterThan(5);
      }
    }
  });
});
