import { test, expect } from "@playwright/test";

test("example.com loads and has title", async ({ page }) => {
  const resp = await page.goto("https://example.com");
  expect(resp?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/Example Domain/i);
});
