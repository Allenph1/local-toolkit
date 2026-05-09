import { test, expect } from "@playwright/test";

/**
 * SiteGround automation tests
 * These tests require SITEGROUND_EMAIL and SITEGROUND_PASSWORD env vars
 * and assume the user will complete 2FA manually when prompted.
 */

test.describe("SiteGround workflows", () => {
  let email = process.env.SITEGROUND_EMAIL;
  let password = process.env.SITEGROUND_PASSWORD;

  test.skip(!email || !password, "Skipping SiteGround tests without credentials");

  test("login flow with 2FA checkpoint", async ({ page, context }) => {
    // Navigate to SiteGround login
    await page.goto("https://my.siteground.com");

    // Handle cookies if present
    const acceptBtn = page.locator("button:has-text('Accept')").first();
    if (await acceptBtn.isVisible()) {
      await acceptBtn.click();
      await page.waitForTimeout(1000);
    }

    // Find and fill email
    const emailInput = page.locator("input[type='email'], input[placeholder*='Email'], input[placeholder*='email']").first();
    await emailInput.fill(email);

    // Find and fill password
    const passwordInput = page.locator("input[type='password']").first();
    await passwordInput.fill(password);

    // Click login button
    const loginBtn = page.locator("button:has-text('LOGIN'), button:has-text('Log in'), button[type='submit']").first();
    await loginBtn.click();

    // Wait for 2FA or successful login (manual checkpoint)
    console.log("🔐 Waiting for 2FA completion...");
    console.log("   If 2FA prompt appears, complete it manually and press Enter when done.");

    // Wait for either dashboard or 2FA timeout (60s)
    await page.waitForFunction(
      () => {
        const url = window.location.href;
        return url.includes("siteground.com") && !url.includes("login");
      },
      { timeout: 60000 }
    );

    // Verify we landed on dashboard
    const title = await page.title();
    expect(title).toContain("SiteGround");
  });

  test("discover hosted sites after login", async ({ page }) => {
    // This requires successful login first
    await page.goto("https://my.siteground.com/websites.htm");

    // Wait for domain names to load (usually in anchor tags or divs)
    await page.waitForSelector("a, div", { timeout: 10000 });

    // Extract visible domain-like text
    const text = await page.textContent("body");
    const domains = text
      ?.split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes(".") && line.length > 4 && line.length < 100 && !line.includes(" "))
      .slice(0, 10);

    console.log("Discovered domains:", domains);
    expect(domains && domains.length > 0).toBeTruthy();
  });
});

test.describe("SiteGround probing", () => {
  test("probe login page health", async ({ page }) => {
    const response = await page.goto("https://my.siteground.com");
    expect(response?.ok()).toBeTruthy();

    const title = await page.title();
    expect(title.toLowerCase()).toContain("siteground");
  });

  test("probe status page availability", async ({ page }) => {
    const response = await page.goto("https://status.siteground.com");
    expect(response?.ok()).toBeTruthy();
  });
});
