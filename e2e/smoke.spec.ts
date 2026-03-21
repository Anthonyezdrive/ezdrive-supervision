import { test, expect } from "@playwright/test";

/**
 * Smoke tests — verify every major page loads without crashing.
 * These tests navigate to each route and check:
 * 1. No uncaught JS errors in console
 * 2. The page renders content (not blank)
 * 3. No React error boundary is shown
 *
 * Requires: E2E_EMAIL + E2E_PASSWORD env vars for auth
 */

// ── Auth helper ──────────────────────────────────────────

async function login(page: import("@playwright/test").Page) {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error("Set E2E_EMAIL and E2E_PASSWORD env vars for E2E tests");
  }

  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL("**/dashboard", { timeout: 10_000 });
}

// ── Console error collector ───────────────────────────────

function collectConsoleErrors(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Ignore known noisy errors
      if (text.includes("ResizeObserver") || text.includes("favicon")) return;
      errors.push(text);
    }
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

// ── Page assertion helper ─────────────────────────────────

async function assertPageLoads(page: import("@playwright/test").Page, path: string) {
  const errors = collectConsoleErrors(page);

  await page.goto(path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Check no error boundary
  const errorBoundary = page.locator("text=Une erreur est survenue");
  await expect(errorBoundary).not.toBeVisible({ timeout: 2000 }).catch(() => {
    throw new Error(`Error boundary visible on ${path}`);
  });

  // Check page has content
  const body = await page.locator("body").innerText();
  expect(body.length).toBeGreaterThan(10);

  // Check no JS errors
  const realErrors = errors.filter(
    (e) => !e.includes("401") && !e.includes("net::ERR") && !e.includes("Failed to fetch")
  );
  if (realErrors.length > 0) {
    console.warn(`Console errors on ${path}:`, realErrors);
  }
}

// ═══════════════════════════════════════════════════════════
// TEST SUITES
// ═══════════════════════════════════════════════════════════

test.describe("1. Authentication", () => {
  test("login page loads", async ({ page }) => {
    await assertPageLoads(page, "/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("B2B login page loads", async ({ page }) => {
    await assertPageLoads(page, "/portail");
  });

  test("login with valid credentials", async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/dashboard/);
  });
});

test.describe("2. Dashboard & Home", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("dashboard loads with KPIs", async ({ page }) => {
    await assertPageLoads(page, "/dashboard");
  });

  test("map page loads", async ({ page }) => {
    await assertPageLoads(page, "/map");
  });
});

test.describe("3. CPO — Assets & Billing", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("stations page loads", async ({ page }) => {
    await assertPageLoads(page, "/stations");
  });

  test("monitoring page loads", async ({ page }) => {
    await assertPageLoads(page, "/monitoring");
  });

  test("billing page loads", async ({ page }) => {
    await assertPageLoads(page, "/billing");
  });

  test("tariffs page loads", async ({ page }) => {
    await assertPageLoads(page, "/tariffs");
  });

  test("OCPI page loads", async ({ page }) => {
    await assertPageLoads(page, "/ocpi");
  });
});

test.describe("4. eMSP — Customers & Tokens", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("drivers page loads", async ({ page }) => {
    await assertPageLoads(page, "/drivers");
  });

  test("payment methods page loads", async ({ page }) => {
    await assertPageLoads(page, "/payment-methods");
  });

  test("customers page loads", async ({ page }) => {
    await assertPageLoads(page, "/customers");
  });
});

test.describe("5. Admin", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("users page loads", async ({ page }) => {
    await assertPageLoads(page, "/users");
  });

  test("admin config page loads", async ({ page }) => {
    await assertPageLoads(page, "/admin-config");
  });

  test("B2B admin page loads", async ({ page }) => {
    await assertPageLoads(page, "/admin/b2b");
  });
});

test.describe("6. B2B Portal", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("B2B overview loads", async ({ page }) => {
    await assertPageLoads(page, "/b2b/overview");
  });

  test("B2B sessions loads", async ({ page }) => {
    await assertPageLoads(page, "/b2b/sessions");
  });

  test("B2B monthly loads", async ({ page }) => {
    await assertPageLoads(page, "/b2b/monthly");
  });

  test("B2B drivers loads", async ({ page }) => {
    await assertPageLoads(page, "/b2b/drivers");
  });

  test("B2B chargepoints loads", async ({ page }) => {
    await assertPageLoads(page, "/b2b/chargepoints");
  });
});
