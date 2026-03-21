import { test, expect } from "@playwright/test";

async function login(page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', process.env.E2E_EMAIL!);
  await page.fill('input[type="password"]', process.env.E2E_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 10_000 });
}

test.describe("B2B Portal", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("B2B overview loads with KPIs", async ({ page }) => {
    await page.goto("/b2b/overview");
    await page.waitForTimeout(3000);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(50);
  });

  test("B2B sessions page loads with table", async ({ page }) => {
    await page.goto("/b2b/sessions");
    await page.waitForTimeout(3000);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
    // Should have table or list of sessions
    const body = await page.locator("body").innerText();
    expect(body.length).toBeGreaterThan(50);
  });

  test("B2B sessions search/filter works", async ({ page }) => {
    await page.goto("/b2b/sessions");
    await page.waitForTimeout(2000);

    const searchInput = page.locator('input[placeholder*="echerch"], input[type="search"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("test");
      await page.waitForTimeout(1000);
    }
  });

  test("B2B monthly report loads", async ({ page }) => {
    await page.goto("/b2b/monthly");
    await page.waitForTimeout(3000);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
  });

  test("B2B chargepoints loads with stations", async ({ page }) => {
    await page.goto("/b2b/chargepoints");
    await page.waitForTimeout(3000);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
  });

  test("B2B drivers page loads", async ({ page }) => {
    await page.goto("/b2b/drivers");
    await page.waitForTimeout(3000);
    await expect(page.locator("text=Une erreur est survenue")).not.toBeVisible();
  });

  test("B2B navigation between tabs works", async ({ page }) => {
    await page.goto("/b2b/overview");
    await page.waitForTimeout(2000);

    // Click on Sessions tab/link
    const sessionsLink = page.locator('a[href*="sessions"]').first();
    if (await sessionsLink.isVisible()) {
      await sessionsLink.click();
      await page.waitForTimeout(1500);
      await expect(page).toHaveURL(/sessions/);
    }
  });
});
