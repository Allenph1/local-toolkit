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
const email = argEmail || process.env.SITEGROUND_EMAIL || process.env.SG_USERNAME;
const password = argPassword || process.env.SITEGROUND_PASSWORD || process.env.SG_PASSWORD;

if (!email || !password) {
  console.error(
    "Usage: SITEGROUND_EMAIL=USER SITEGROUND_PASSWORD=SECRET npm run probe-sg\n" +
      "   or: SG_USERNAME=USER SG_PASSWORD=SECRET npm run probe-sg\n" +
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
  await emailInput.waitFor({ state: "visible", timeout: 15000 });
  await emailInput.fill(email);

  const passwordInput = page.locator("input[name*='password'], input[type='password']").first();
  await passwordInput.waitFor({ state: "visible", timeout: 15000 });
  await passwordInput.fill(password);

  console.log("Clicking login...");
  const loginBtn = page.locator("button:has-text('LOGIN'), button:has-text('Login'):not(:has-text('Google')), button[type='submit']").first();
  await loginBtn.waitFor({ state: "visible", timeout: 15000 });
  await loginBtn.click();

  console.log("Waiting for authentication outcome...");
  let state = "unknown";
  let diagnostics = {
    challengeDetected: false,
    twoFactorDetected: false,
    credentialErrorDetected: false
  };
  try {
    await page.waitForURL(
      (url) => url.href.includes("my.siteground.com") && !url.href.includes("login"),
      { timeout: 70000 }
    );
    state = "authenticated";
  } catch (_error) {
    const currentUrl = page.url();
    const bodyText = ((await page.textContent("body")) || "").toLowerCase();
    diagnostics = {
      challengeDetected:
        bodyText.includes("captcha") ||
        bodyText.includes("verify you are human") ||
        bodyText.includes("security challenge"),
      twoFactorDetected:
        currentUrl.includes("hash=") ||
        bodyText.includes("2fa") ||
        bodyText.includes("two-factor") ||
        bodyText.includes("verification code") ||
        bodyText.includes("authenticator"),
      credentialErrorDetected:
        bodyText.includes("invalid") ||
        bodyText.includes("incorrect") ||
        bodyText.includes("wrong password")
    };
    if (
      diagnostics.twoFactorDetected
    ) {
      state = "pending_2fa";
    } else if (diagnostics.credentialErrorDetected) {
      state = "auth_failed";
    } else if (diagnostics.challengeDetected) {
      state = "challenge_required";
    } else if (currentUrl.includes("login.siteground.com")) {
      state = "login_page_timeout";
    }
  }

  const title = await page.title();
  const elapsedMs = Date.now() - started;

  if (screenshot) {
    await page.screenshot({ path: screenshot, fullPage: true });
  }

  console.log(
    JSON.stringify(
      {
        ok: state === "authenticated" || state === "pending_2fa",
        state,
        url: page.url(),
        httpStatus: response ? response.status() : null,
        title,
        diagnostics,
        elapsedMs,
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
