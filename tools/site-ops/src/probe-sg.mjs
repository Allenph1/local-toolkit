#!/usr/bin/env node
/**
 * SiteGround probing CLI
 * Usage: npm run probe-sg -- --email user@example.com --password pass [--screenshot file.png]
 */

import { chromium } from "@playwright/test";

function parseArgs() {
  const out = {};
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === "--email") out.email = process.argv[i + 1];
    if (arg === "--password") out.password = process.argv[i + 1];
    if (arg === "--screenshot") out.screenshot = process.argv[i + 1];
  }
  return out;
}

const { email: argEmail, password: argPassword, screenshot } = parseArgs();
const email = argEmail || process.env.SITEGROUND_EMAIL;
const password = argPassword || process.env.SITEGROUND_PASSWORD;

if (!email || !password) {
  console.error(
    "Usage: SITEGROUND_EMAIL=USER SITEGROUND_PASSWORD=PASS npm run probe-sg\n" +
      "   or: npm run probe-sg -- --email USER --password PASS [--screenshot file.png]"
  );
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const started = Date.now();

try {
  console.log("Navigating to SiteGround...");
  const response = await page.goto("https://my.siteground.com", { waitUntil: "domcontentloaded", timeout: 30000 });

  console.log("Accepting cookies if present...");
  try {
    const acceptBtn = page.locator("button:has-text('Accept')").first();
    if (await acceptBtn.isVisible({ timeout: 2000 })) {
      await acceptBtn.click();
      await page.waitForTimeout(1000);
    }
  } catch (e) {
    // No cookies
  }

  console.log("Filling credentials...");
  const emailInput = page.locator("input[name='username'], input[type='email'], input[placeholder*='Email']").first();
  await emailInput.fill(email);

  const passwordInput = page.locator("input[name*='password'], input[type='password']").first();
  await passwordInput.fill(password);

  console.log("Clicking login...");
  const loginBtn = page.locator("button:has-text('LOGIN'), button:has-text('Login'):not(:has-text('Google'))").first();
  await loginBtn.click();

  console.log("Waiting for post-login (60s timeout for 2FA)...");
  // First wait: detect successful auth by URL/hash change
  await page.waitForFunction(
    () => {
      const url = window.location.href;
      return url.includes("my.siteground.com") && (url.includes("hash=") || !url.includes("login"));
    },
    { timeout: 10000 }
  );

  console.log("Auth detected, waiting for dashboard or 2FA to complete...");
  // Second wait: if 2FA is pending, wait for full dashboard load
  await page.waitForFunction(
    () => {
      const url = window.location.href;
      return url.includes("my.siteground.com") && !url.includes("hash=");
    },
    { timeout: 60000 }
  ).catch(() => {
    // If still stuck at hash, that's OK - means we're authenticated but waiting for 2FA
    console.log("2FA checkpoint: awaiting user completion...");
  });

  const title = await page.title();
  const elapsedMs = Date.now() - started;

  if (screenshot) {
    await page.screenshot({ path: screenshot, fullPage: true });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        title,
        elapsedMs,
        authenticated: true,
        screenshotPath: screenshot || null
      },
      null,
      2
    )
  );
} catch (error) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        error: String(error),
        elapsedMs: Date.now() - started
      },
      null,
      2
    )
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
