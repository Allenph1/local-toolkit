#!/usr/bin/env node
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

function credentials() {
  const email = process.env.SITEGROUND_EMAIL || process.env.SG_USERNAME || "";
  const password = process.env.SITEGROUND_PASSWORD || process.env.SG_PASSWORD || "";
  return { email, password };
}

function authStatePath() {
  return process.env.SITEGROUND_AUTH_STATE || path.resolve(process.cwd(), ".data/siteground-auth.json");
}

function browserProfileDir() {
  return process.env.SG_BROWSER_PROFILE_DIR || path.resolve(process.cwd(), ".data/sg-browser-profile");
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
  return classify(page);
}

function resolveActivePage(context, page) {
  if (page && !page.isClosed()) return page;
  const openPages = context.pages().filter((p) => !p.isClosed());
  return openPages.length > 0 ? openPages[openPages.length - 1] : null;
}

async function waitForHumanCompletion(context, page) {
  const deadline = Date.now() + 5 * 60 * 1000;
  let lastState = "unknown";
  let activePage = page;
  while (Date.now() < deadline) {
    activePage = resolveActivePage(context, activePage);
    if (!activePage) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    try {
      const state = await checkAuthenticated(activePage);
      if (state === "authenticated") return { state, page: activePage };
      if (state !== lastState) {
        console.log(`Waiting for challenge/2FA completion... current state=${state}`);
        lastState = state;
      }
      await activePage.waitForTimeout(4000);
    } catch (_err) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  activePage = resolveActivePage(context, activePage);
  const finalState = activePage ? await checkAuthenticated(activePage) : "unknown";
  return { state: finalState, page: activePage };
}

async function main() {
  const started = Date.now();
  const { email, password } = credentials();
  if (!email || !password) {
    console.error("Missing SiteGround credentials. Set SITEGROUND_EMAIL/SITEGROUND_PASSWORD or SG_USERNAME/SG_PASSWORD.");
    process.exit(2);
  }

  const statePath = authStatePath();
  const profileDir = browserProfileDir();
  ensureParentDir(path.join(profileDir, ".keep"));
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: process.env.SG_BROWSER_CHANNEL || "chromium",
    headless: false,
    viewport: { width: 1366, height: 900 }
  });
  const page = context.pages()[0] || (await context.newPage());

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
    const waitResult = await waitForHumanCompletion(context, page);
    const state = waitResult.state;
    const activePage = waitResult.page || page;
    if (state !== "authenticated") {
      console.log(JSON.stringify({ ok: false, state, url: activePage.url(), authStatePath: statePath, elapsedMs: Date.now() - started }, null, 2));
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
          url: activePage.url(),
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
  }
}

await main();
