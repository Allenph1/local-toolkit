#!/usr/bin/env node
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: false, slowMo: 500 });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

try {
  await page.goto("https://my.siteground.com");
  
  await page.locator("input[name='username']").fill("jdwipplinger@gmail.com");
  console.log("✓ Email filled");
  
  await page.locator("input[name*='password']").fill("DM456lm67#");
  console.log("✓ Password filled");
  
  const btn = page.locator("button:has-text('Login'):not(:has-text('Google'))");
  console.log("Trying to click login button...");
  await btn.click();
  console.log("✓ Click sent");
  
  console.log("Waiting for any navigation...");
  await page.waitForTimeout(5000);
  console.log(`URL after click: ${page.url()}`);
  
} catch (error) {
  console.error("Error:", error.message);
} finally {
  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
}
