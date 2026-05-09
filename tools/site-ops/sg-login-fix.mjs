#!/usr/bin/env node
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

try {
  await page.goto("https://my.siteground.com");

  // Fill inputs
  await page.locator("input[name='username']").fill("jdwipplinger@gmail.com");
  await page.locator("input[name*='password']").fill("DM456lm67#");

  // Wait for form to be ready
  await page.waitForLoadState("networkidle");

  console.log("Submitting form with keyboard enter...");
  await page.locator("input[name*='password']").press("Enter");
  
  console.log("Waiting for page load...");
  await page.waitForLoadState("networkidle").catch(() => {});
  
  console.log("URL after submit:", page.url());
  
  await page.waitForTimeout(3000);
  console.log("Final URL:", page.url());
  
  if (page.url().includes("my.siteground.com/paneladmin")) {
    console.log("✓ Login successful!");
  } else if (page.url().includes("my.siteground.com")) {
    console.log("✓ On my.siteground.com (may need 2FA)");
  } else {
    console.log("! Still on login page");
  }

} catch (error) {
  console.error("Error:", error.message);
} finally {
  await page.waitForTimeout(5000);
  await browser.close();
}
