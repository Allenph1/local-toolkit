#!/usr/bin/env node
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

try {
  console.log("1. Loading login page...");
  await page.goto("https://my.siteground.com", { waitUntil: "networkidle" });

  console.log("2. Filling email...");
  const emailInput = page.locator("input[name='username']");
  await emailInput.focus();
  await emailInput.fill("jdwipplinger@gmail.com");

  console.log("3. Filling password...");
  const passInput = page.locator("input[name*='password']");
  await passInput.focus();
  await passInput.fill("DM456lm67#");

  console.log("4. Clicking login (waiting 3s for form processing)...");
  await page.locator("button:has-text('Login'):not(:has-text('Google'))").click();
  await page.waitForTimeout(3000);

  console.log("5. Checking URL after login...");
  console.log("   URL:", page.url());

  // Wait for dashboard to fully load
  console.log("6. Waiting for dashboard to load...");
  try {
    await page.waitForURL(/my\.siteground\.com\/paneladmin/, { timeout: 10000 });
    console.log("   ✓ Dashboard URL detected");
  } catch {
    console.log("   Still on:", page.url());
  }

  console.log("7. Navigating to domains...");
  await page.goto("https://my.siteground.com/paneladmin/domains", { waitUntil: "networkidle" });
  
  const domainPage = await page.content();
  if (domainPage.includes("vosadigital")) {
    console.log("   ✓ vosadigital found on domains page");
  } else {
    console.log("   ! vosadigital not on page, trying site search...");
  }

  console.log("8. Searching for vosadigital...");
  const searchBox = page.locator("input[type='search'], input[placeholder*='search' i]").first();
  if (await searchBox.isVisible().catch(() => false)) {
    await searchBox.fill("vosadigital");
    await page.waitForTimeout(1500);
    console.log("   ✓ Search executed");
  }

  console.log("9. Clicking vosadigital site...");
  const vosaLink = page.locator("a, button", { hasText: /vosadigital/i }).first();
  await vosaLink.click();
  await page.waitForNavigation().catch(() => {});

  console.log("10. Current URL:", page.url());
  console.log("11. Waiting for site manager to load...");
  await page.waitForTimeout(2000);

  console.log("12. Taking screenshot of site manager...");
  await page.screenshot({ path: "/tmp/vosadigital-manager.png", fullPage: true });

  console.log("13. Searching for SSH token...");
  const pageHTML = await page.content();
  const lines = pageHTML.split('\n');
  
  const sshLines = [];
  lines.forEach((line, i) => {
    if (line.match(/ssh|token|credential|key\s+/i) && !line.includes("script")) {
      sshLines.push(line.substring(0, 200));
    }
  });

  console.log("\nSSH-related lines found:");
  sshLines.forEach(line => console.log("  ", line.substring(0, 120)));

  // Also search for specific token names
  const tokenMatch = pageHTML.match(/data-token|token["\']?\s*[:=]/gi);
  console.log("\nToken references:", tokenMatch ? tokenMatch.slice(0, 10) : "none");

  // Look for input fields with SSH names
  const inputs = await page.locator("input[name*='ssh'], input[name*='token'], input[id*='ssh'], input[id*='token']").allTextContents();
  console.log("\nSSH input fields:", inputs);

  // Just list all visible text mentioning these terms
  const allText = await page.locator("body").textContent();
  const sshMatches = allText.match(/ssh\s+\w+|token\s+\w+|credential\s+\w+/gi);
  if (sshMatches) {
    console.log("\nMatched SSH/token phrases:");
    [...new Set(sshMatches)].slice(0, 20).forEach(m => console.log("  -", m));
  }

} catch (error) {
  console.error("Error:", error.message);
} finally {
  console.log("\n(Leaving browser open for 5s...)");
  await page.waitForTimeout(5000);
  await browser.close();
}
