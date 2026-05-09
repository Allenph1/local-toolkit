#!/usr/bin/env node
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

try {
  await page.goto("https://my.siteground.com", { waitUntil: "domcontentloaded" });
  
  // Fill and submit
  await page.locator("input[name='username']").fill("jdwipplinger@gmail.com");
  await page.locator("input[name*='password']").fill("DM456lm67#");
  
  // Check button text
  const btns = await page.locator("button").allTextContents();
  console.log("Buttons:", btns);
  
  await page.locator("button[type='submit']").click();
  
  console.log("Submitted. Waiting for 2FA or redirect...");
  await page.waitForTimeout(5000);
  
  console.log("Current URL:", page.url());
  console.log("Page title:", await page.title());
  
  // Take screenshot
  await page.screenshot({ path: "/tmp/siteground-after-login.png" });
  console.log("Screenshot saved.");
  
  // Look for 2FA indicators
  const pageContent = await page.content();
  if (pageContent.includes("2FA") || pageContent.includes("two-factor") || pageContent.includes("OTP")) {
    console.log("✓ 2FA page detected");
  }
  if (pageContent.includes("verification") || pageContent.includes("code")) {
    console.log("✓ Verification/code prompt detected");
  }
  
} catch (error) {
  console.error("Error:", error);
} finally {
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
}
