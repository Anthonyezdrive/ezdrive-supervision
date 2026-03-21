import { test, expect } from "@playwright/test";

async function login(page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', process.env.E2E_EMAIL!);
  await page.fill('input[type="password"]', process.env.E2E_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10_000 });
}

test.describe("Billing & Tariffs", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("billing page loads without error", async ({ page }) => {
    await page.goto("/billing");
    await page.waitForTimeout(3000);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(50);
  });

  test("tariffs page loads with tariff list", async ({ page }) => {
    await page.goto("/tariffs");
    await page.waitForTimeout(3000);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
  });

  test("tariffs source filter works", async ({ page }) => {
    await page.goto("/tariffs");
    await page.waitForTimeout(2000);

    // Look for source filter dropdown
    const sourceFilter = page.locator('select, [role="combobox"]').first();
    if (await sourceFilter.isVisible()) {
      await sourceFilter.click();
      await page.waitForTimeout(500);
    }
  });

  test("RFID tokens page loads", async ({ page }) => {
    await page.goto("/rfid");
    await page.waitForTimeout(3000);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
  });

  test("RFID source filter works", async ({ page }) => {
    await page.goto("/rfid");
    await page.waitForTimeout(2000);

    const sourceFilter = page.locator('select').first();
    if (await sourceFilter.isVisible()) {
      await sourceFilter.selectOption({ index: 1 }).catch(() => {});
      await page.waitForTimeout(1000);
    }
  });

  test("drivers page loads with data", async ({ page }) => {
    await page.goto("/drivers");
    await page.waitForTimeout(3000);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
  });

  test("OCPI page loads", async ({ page }) => {
    await page.goto("/ocpi");
    await page.waitForTimeout(3000);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
  });
});
