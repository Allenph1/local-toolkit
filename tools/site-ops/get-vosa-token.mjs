#!/usr/bin/env node
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  console.log("Loading SiteGround my.siteground.com...");
  await page.goto("https://my.siteground.com", { waitUntil: "domcontentloaded", timeout: 15000 });

  // Fill credentials
  await page.locator("input[name='username']").fill("jdwipplinger@gmail.com");
  await page.locator("input[name*='password']").fill("DM456lm67#");
  
  console.log("Submitting login...");
  await page.locator("button:has-text('Login'):not(:has-text('Google'))").click();

  // Wait for page to change (check for hash token or dashboard)
  let attempts = 0;
  while (attempts < 20) {
    await page.waitForTimeout(500);
    const url = page.url();
    if (url.includes("my.siteground.com") && !url.includes("login")) {
      console.log("✓ Logged in. URL:", url);
      break;
    }
    attempts++;
  }

  console.log("Looking for vosadigital domain...");
  // Try to find vosadigital in the page or navigate directly
  const pageText = await page.locator("body").textContent();
  if (pageText.includes("vosadigital")) {
    console.log("✓ vosadigital found on page");
  }

  // Try clicking on domains or looking for site manager
  let found = false;
  const links = await page.locator("a").allTextContents();
  console.log("Available links:", links.slice(0, 20));
  
  // Direct navigation to domains
  console.log("\nTrying to navigate to domains page...");
  await page.goto("https://my.siteground.com/paneladmin/domains", { waitUntil: "domcontentloaded", timeout: 10000 });
  
  const domainsText = await page.locator("body").textContent();
  if (domainsText.includes("vosadigital")) {
    console.log("✓ vosadigital on domains page");
    
    // Look for vosadigital link/button and click it
    const vosaLink = page.locator("a, button", { hasText: /vosadigital/i }).first();
    if (await vosaLink.isVisible()) {
      console.log("✓ Found vosadigital link, clicking...");
      await vosaLink.click();
      await page.waitForNavigation({ timeout: 5000 }).catch(() => {});
    }
  }

  // Navigate to site manager directly
  console.log("Navigating to site manager for vosadigital.com...");
  await page.goto("https://my.siteground.com/paneladmin/sites/vosadigital.com", { 
    waitUntil: "domcontentloaded", 
    timeout: 10000 
  });
  
  console.log("Current URL:", page.url());
  const managerText = await page.locator("body").textContent();
  
  // Look for SSH token
  const sshTokenMatch = managerText.match(/ssh|token|key|credential/gi);
  if (sshTokenMatch) {
    console.log("✓ Found SSH-related text:", sshTokenMatch.slice(0, 10));
  }
  
  // Look for specific SSH field
  const sshFields = await page.locator("input, div, p", { hasText: /ssh|token|key/i }).allTextContents();
  console.log("\nSSH-related fields:", sshFields.slice(0, 15));
  
  // Take screenshot for inspection
  await page.screenshot({ path: "/tmp/vosadigital-manager.png", fullPage: true });
  console.log("\n✓ Screenshot saved: /tmp/vosadigital-manager.png");
  
  // Dump page HTML for grepping
  const html = await page.content();
  const lines = html.split('\n');
  lines.forEach((line, i) => {
    if (line.match(/ssh|token|credential|key/i) && !line.includes("<script")) {
      console.log(`Line ${i}: ${line.substring(0, 150)}`);
    }
  });

} catch (error) {
  console.error("Error:", error.message);
} finally {
  await browser.close();
}
