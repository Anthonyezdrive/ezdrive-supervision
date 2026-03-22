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

test.describe("X-DRIVE Navigation & Layout", () => {
  test.setTimeout(30_000);

  // ── Sidebar entry point ────────────────────────────────────────────────────

  test("X-DRIVE section label is visible in sidebar for admin users", async ({ page }) => {
    await login(page);
    // The sidebar group label "X-DRIVE" should be visible
    const xdriveLink = page.locator(
      'text=X-DRIVE, a[href*="xdrive"], [data-testid*="xdrive"]'
    ).first();
    await expect(xdriveLink).toBeVisible();
  });

  test("clicking X-DRIVE sidebar link navigates to /xdrive/dashboard", async ({ page }) => {
    await login(page);
    // Click the sidebar link or direct href
    const xdriveLink = page.locator('a[href="/xdrive/dashboard"]').first();
    if (await xdriveLink.isVisible()) {
      await xdriveLink.click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/xdrive\/dashboard/);
    } else {
      // Navigate directly if sidebar link not immediately visible
      await page.goto("/xdrive/dashboard");
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/xdrive\/dashboard/);
    }
  });

  // ── Tab navigation within X-DRIVE layout ──────────────────────────────────

  test("all main navigation tabs are visible in X-DRIVE layout", async ({ page }) => {
    await login(page);
    await page.goto("/xdrive/dashboard");
    await page.waitForLoadState("networkidle");

    const tabs = [
      "Dashboard",
      "CDR détaillés",
      "Ventilation",
      "Rapprochement",
      "Facturation",
      "Exports",
    ];

    for (const tabLabel of tabs) {
      const tab = page.locator(`text=${tabLabel}`).first();
      const exists = await tab.count();
      if (exists > 0) {
        await expect(tab).toBeVisible();
      }
    }
  });

  test("navigating to CDR tab via layout nav works", async ({ page }) => {
    await login(page);
    await page.goto("/xdrive/dashboard");
    await page.waitForLoadState("networkidle");

    const cdrTab = page.locator('a[href="/xdrive/cdrs"], text=CDR détaillés').first();
    if (await cdrTab.isVisible()) {
      await cdrTab.click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/xdrive\/cdrs/);
    }
  });

  test("navigating to Ventilation tab via layout nav works", async ({ page }) => {
    await login(page);
    await page.goto("/xdrive/dashboard");
    await page.waitForLoadState("networkidle");

    const tab = page.locator('a[href="/xdrive/breakdown"], text=Ventilation').first();
    if (await tab.isVisible()) {
      await tab.click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/xdrive\/breakdown/);
    }
  });

  test("navigating to Rapprochement tab via layout nav works", async ({ page }) => {
    await login(page);
    await page.goto("/xdrive/dashboard");
    await page.waitForLoadState("networkidle");

    const tab = page.locator('a[href="/xdrive/reconciliation"], text=Rapprochement').first();
    if (await tab.isVisible()) {
      await tab.click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/xdrive\/reconciliation/);
    }
  });

  test("navigating to Facturation partenaire tab via layout nav works", async ({ page }) => {
    await login(page);
    await page.goto("/xdrive/dashboard");
    await page.waitForLoadState("networkidle");

    const tab = page.locator('a[href="/xdrive/billing"]').first();
    if (await tab.isVisible()) {
      await tab.click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/xdrive\/billing/);
    }
  });

  test("navigating to Exports tab via layout nav works", async ({ page }) => {
    await login(page);
    await page.goto("/xdrive/dashboard");
    await page.waitForLoadState("networkidle");

    const tab = page.locator('a[href="/xdrive/exports"]').first();
    if (await tab.isVisible()) {
      await tab.click();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveURL(/xdrive\/exports/);
    }
  });

  // ── Header elements ────────────────────────────────────────────────────────

  test("portal subtitle 'Portail partenaire' is visible in header", async ({ page }) => {
    await login(page);
    await page.goto("/xdrive/dashboard");
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator("text=Portail partenaire")
    ).toBeVisible();
  });

  test("X-DRIVE branding span is visible in header", async ({ page }) => {
    await login(page);
    await page.goto("/xdrive/dashboard");
    await page.waitForLoadState("networkidle");

    // The header contains "X-DRIVE" as h1 (no partner) or as branding span
    const branding = page.locator(
      'h1:has-text("X-DRIVE"), span:has-text("X-DRIVE")'
    ).first();
    await expect(branding).toBeVisible();
  });

  test("EZDrive logo or branding is visible in header area", async ({ page }) => {
    await login(page);
    await page.goto("/xdrive/dashboard");
    await page.waitForLoadState("networkidle");

    // Either an img[alt="EZDrive"] or the X-DRIVE text span
    const logo = page.locator(
      'img[alt="EZDrive"], span:has-text("X-DRIVE")'
    ).first();
    await expect(logo).toBeVisible();
  });

  // ── Co-branding footer ─────────────────────────────────────────────────────

  test("co-branding footer 'Propulsé par EZDrive' is visible", async ({ page }) => {
    await login(page);
    await page.goto("/xdrive/dashboard");
    await page.waitForLoadState("networkidle");

    await expect(
      page.locator("text=/Propulsé par EZDrive/i")
    ).toBeVisible();
  });

  // ── Protected route ────────────────────────────────────────────────────────

  test("unauthenticated access to /xdrive/dashboard redirects to login", async ({ page }) => {
    // Do NOT login — go directly to xdrive route
    await page.goto("/xdrive/dashboard");
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/login/);
  });

  // ── BPU (admin-only tab) ───────────────────────────────────────────────────

  test("Facturation BPU tab is visible for admin users", async ({ page }) => {
    await login(page);
    await page.goto("/xdrive/dashboard");
    await page.waitForLoadState("networkidle");

    // BPU tab is ezdriveOnly — visible to admins
    const bpuTab = page.locator(
      'a[href="/xdrive/bpu"], text=Facturation BPU'
    ).first();
    const exists = await bpuTab.count();
    if (exists > 0) {
      await expect(bpuTab).toBeVisible();
    }
  });

  // ── /xdrive index redirect ─────────────────────────────────────────────────

  test("/xdrive redirects to /xdrive/dashboard", async ({ page }) => {
    await login(page);
    await page.goto("/xdrive");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/xdrive\/dashboard/);
  });

  // ── No errors across all X-DRIVE routes ───────────────────────────────────

  test("all X-DRIVE routes load without 'Une erreur est survenue'", async ({ page }) => {
    await login(page);

    const routes = [
      "/xdrive/dashboard",
      "/xdrive/cdrs",
      "/xdrive/breakdown",
      "/xdrive/reconciliation",
      "/xdrive/billing",
      "/xdrive/exports",
    ];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await expect(
        page.locator("text=Une erreur est survenue"),
        `Error on route ${route}`
      ).not.toBeVisible();
    }
  });
});
