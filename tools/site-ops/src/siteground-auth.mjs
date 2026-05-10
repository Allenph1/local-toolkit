#!/usr/bin/env node
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";

function credentials() {
  const email = process.env.SITEGROUND_EMAIL || process.env.SG_USERNAME || "";
  const password = process.env.SITEGROUND_PASSWORD || process.env.SG_PASSWORD || "";
  return { email, password };
}

function authStatePath() {
  return process.env.SITEGROUND_AUTH_STATE || path.resolve(process.cwd(), ".data/siteground-auth.json");
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function classify(page) {
  const currentUrl = page.url();
  const bodyText = ((await page.textContent("body")) || "").toLowerCase();
  if (currentUrl.includes("my.siteground.com") && !currentUrl.includes("login")) return "authenticated";
  if (currentUrl.includes("hash=") || bodyText.includes("2fa") || bodyText.includes("two-factor") || bodyText.includes("verification code")) {
    return "pending_2fa";
  }
  if (bodyText.includes("invalid") || bodyText.includes("incorrect") || bodyText.includes("wrong password")) return "auth_failed";
  if (bodyText.includes("captcha") || bodyText.includes("verify you are human") || bodyText.includes("security challenge")) return "challenge_required";
  if (currentUrl.includes("login.siteground.com")) return "login_page_timeout";
  return "unknown";
}

async function checkAuthenticated(page) {
  const current = await classify(page);
  if (current === "authenticated") return "authenticated";
  try {
    await page.goto("https://my.siteground.com/paneladmin/domains", {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
  } catch (_err) {}
  return classify(page);
}

async function waitForHumanCompletion(page) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    await page.waitForURL((url) => url.href.includes("my.siteground.com") && !url.href.includes("login"), {
      timeout: 300000
    });
    return await checkAuthenticated(page);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const state = await checkAuthenticated(page);
      if (state === "authenticated") return state;
      const answer = await rl.question(
        `Challenge/2FA still pending (state=${state}). Complete it in the browser, then press Enter to continue (q to abort): `
      );
      if (answer.trim().toLowerCase() === "q") return state;
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const started = Date.now();
  const { email, password } = credentials();
  if (!email || !password) {
    console.error("Missing SiteGround credentials. Set SITEGROUND_EMAIL/SITEGROUND_PASSWORD or SG_USERNAME/SG_PASSWORD.");
    process.exit(2);
  }

  const statePath = authStatePath();
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto("https://my.siteground.com", { waitUntil: "domcontentloaded", timeout: 30000 });
    try {
      const acceptBtn = page.locator("button:has-text('Accept')").first();
      if (await acceptBtn.isVisible({ timeout: 1500 })) await acceptBtn.click();
    } catch (_err) {}

    const emailInput = page.locator("input[name='username'], input[type='email'], input[placeholder*='Email']").first();
    const passwordInput = page.locator("input[name*='password'], input[type='password']").first();
    const loginBtn = page.locator("button:has-text('LOGIN'), button:has-text('Login'):not(:has-text('Google')), button[type='submit']").first();
    await emailInput.waitFor({ state: "visible", timeout: 15000 });
    await emailInput.fill(email);
    await passwordInput.waitFor({ state: "visible", timeout: 15000 });
    await passwordInput.fill(password);
    await loginBtn.waitFor({ state: "visible", timeout: 15000 });
    await loginBtn.click();

    console.log("Browser opened. Complete captcha/2FA in that window; this command will wait for you.");
    const state = await waitForHumanCompletion(page);
    if (state !== "authenticated") {
      console.log(JSON.stringify({ ok: false, state, url: page.url(), authStatePath: statePath, elapsedMs: Date.now() - started }, null, 2));
      process.exitCode = 1;
      return;
    }

    ensureParentDir(statePath);
    await context.storageState({ path: statePath });
    console.log(
      JSON.stringify(
        {
          ok: true,
          state: "authenticated",
          url: page.url(),
          authStatePath: statePath,
          elapsedMs: Date.now() - started
        },
        null,
        2
      )
    );
  } catch (error) {
    const state = await classify(page).catch(() => "unknown");
    console.log(JSON.stringify({ ok: false, state, error: String(error), url: page.url(), authStatePath: statePath, elapsedMs: Date.now() - started }, null, 2));
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
}

await main();
