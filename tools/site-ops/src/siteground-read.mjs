#!/usr/bin/env node
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";

function parseArgs() {
  const out = { action: "", site: "" };
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (!arg.startsWith("--") && !out.action) out.action = arg;
    if (arg === "--site") out.site = process.argv[i + 1] || "";
    if (arg === "--screenshot") out.screenshot = process.argv[i + 1] || "";
  }
  return out;
}

function credentials() {
  const email = process.env.SITEGROUND_EMAIL || process.env.SG_USERNAME || "";
  const password = process.env.SITEGROUND_PASSWORD || process.env.SG_PASSWORD || "";
  return { email, password };
}

function extractDomainsFromText(text) {
  const matches = text.match(/\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\b/gi) || [];
  const blocked = new Set(["siteground.com", "my.siteground.com", "google.com"]);
  return [...new Set(matches.map((m) => m.toLowerCase()))].filter((m) => {
    if (blocked.has(m)) return false;
    if (!/[a-z]/.test(m)) return false;
    const tld = m.split(".").pop() || "";
    if (tld.length < 2 || tld.length > 24 || /[^a-z]/.test(tld)) return false;
    if (m.includes(".maximum")) return false;
    return true;
  });
}

async function loginAndClassify(page, email, password) {
  const response = await page.goto("https://my.siteground.com", { waitUntil: "domcontentloaded", timeout: 30000 });

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

  let state = "unknown";
  try {
    await page.waitForURL((url) => url.href.includes("my.siteground.com") && !url.href.includes("login"), { timeout: 70000 });
    state = "authenticated";
  } catch (_err) {
    const currentUrl = page.url();
    const bodyText = ((await page.textContent("body")) || "").toLowerCase();
    if (currentUrl.includes("hash=") || bodyText.includes("2fa") || bodyText.includes("two-factor") || bodyText.includes("verification code")) {
      state = "pending_2fa";
    } else if (bodyText.includes("invalid") || bodyText.includes("incorrect") || bodyText.includes("wrong password")) {
      state = "auth_failed";
    } else if (bodyText.includes("captcha") || bodyText.includes("verify you are human") || bodyText.includes("security challenge")) {
      state = "challenge_required";
    } else if (currentUrl.includes("login.siteground.com")) {
      state = "login_page_timeout";
    }
  }

  return {
    state,
    url: page.url(),
    loginStatus: response ? response.status() : null
  };
}

async function checkAuthenticatedSession(page) {
  const response = await page.goto("https://my.siteground.com/paneladmin/domains", {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });
  const url = page.url();
  const authenticated = url.includes("my.siteground.com") && !url.includes("login");
  return {
    authenticated,
    state: authenticated ? "authenticated" : "auth_required",
    url,
    loginStatus: response ? response.status() : null
  };
}

function authStatePath() {
  return process.env.SITEGROUND_AUTH_STATE || path.resolve(process.cwd(), ".data/siteground-auth.json");
}

function browserProfileDir() {
  return process.env.SG_BROWSER_PROFILE_DIR || path.resolve(process.cwd(), ".data/sg-browser-profile");
}

function isHeadless() {
  const raw = (process.env.SG_HEADLESS || "true").toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "no");
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function hasStateFile(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

async function promptRetryIfInteractive(promptText) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${promptText} [y/N]: `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function listSites(page) {
  await page.goto("https://my.siteground.com/paneladmin/sites", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);

  const bodyText = (await page.textContent("body")) || "";
  const fromText = extractDomainsFromText(bodyText);

  const hrefSites = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const out = [];
    for (const a of anchors) {
      const href = a.getAttribute("href") || "";
      if (!href.includes("/paneladmin/sites/")) continue;
      const label = (a.textContent || "").trim();
      out.push({ href, label });
    }
    return out;
  });

  const fromHref = hrefSites
    .map((s) => {
      const m = s.href.match(/\/paneladmin\/sites\/([^/?#]+)/);
      return m ? decodeURIComponent(m[1]).toLowerCase() : "";
    })
    .filter(Boolean);

  const hrefOnly = [...new Set(fromHref)].sort();
  const all = hrefOnly.length > 0 ? hrefOnly : [...new Set(fromText)].sort();
  return {
    count: all.length,
    sites: all,
    readOnly: true
  };
}

async function listSshKeys(page, site) {
  const encodedSite = encodeURIComponent(site.toLowerCase());
  const startUrl = `https://my.siteground.com/paneladmin/sites/${encodedSite}`;
  await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);
  const discovered = await page.evaluate((siteName) => {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const candidates = [];
    for (const a of anchors) {
      const href = a.getAttribute("href") || "";
      const text = (a.textContent || "").toLowerCase();
      const lowerHref = href.toLowerCase();
      if (!lowerHref.includes(`/paneladmin/sites/${siteName}`)) continue;
      if (
        text.includes("ssh") ||
        text.includes("key") ||
        text.includes("developer") ||
        text.includes("access") ||
        lowerHref.includes("ssh") ||
        lowerHref.includes("key") ||
        lowerHref.includes("dev")
      ) {
        candidates.push(href);
      }
    }
    return [...new Set(candidates)].slice(0, 20);
  }, encodedSite);
  const candidates = [startUrl, ...discovered.map((h) => (h.startsWith("http") ? h : `https://my.siteground.com${h}`))];

  const visited = [];
  const sshLines = [];
  const keyLike = [];

  for (const candidate of candidates) {
    const url = candidate.startsWith("http") ? candidate : `https://my.siteground.com${candidate}`;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1200);
      visited.push(page.url());
      const allText = ((await page.textContent("body")) || "").replace(/\r/g, "");
      const lines = allText.split("\n").map((s) => s.trim()).filter(Boolean);

      for (const line of lines) {
        const lower = line.toLowerCase();
        if (
          lower.includes("ssh key") ||
          lower.includes("public key") ||
          lower.includes("fingerprint") ||
          lower.includes("authorized key") ||
          line.startsWith("ssh-rsa ") ||
          line.startsWith("ssh-ed25519 ") ||
          line.includes("SHA256:")
        ) {
          sshLines.push(line);
        }
      }
      for (const line of lines) {
        if (line.startsWith("ssh-rsa ") || line.startsWith("ssh-ed25519 ") || line.includes("SHA256:")) {
          keyLike.push(line);
        }
      }
    } catch (_err) {
      visited.push(`${url} [failed]`);
    }
  }

  const uniqueSshLines = [...new Set(sshLines)].slice(0, 200);
  const uniqueKeyLike = [...new Set(keyLike)].slice(0, 200);

  return {
    site,
    visitedUrls: [...new Set(visited)].slice(0, 50),
    sshSignalsCount: uniqueSshLines.length,
    sshSignals: uniqueSshLines,
    keyMaterialHints: uniqueKeyLike,
    readOnly: true
  };
}

async function main() {
  const args = parseArgs();
  const started = Date.now();
  const { email, password } = credentials();

  if (!args.action || !["list-sites", "list-ssh-keys"].includes(args.action)) {
    console.error("Usage: npm run sg-read -- <list-sites|list-ssh-keys> [--site domain] [--screenshot file.png]");
    process.exit(2);
  }

  if (!email || !password) {
    console.error("Missing SiteGround credentials. Set SITEGROUND_EMAIL/SITEGROUND_PASSWORD or SG_USERNAME/SG_PASSWORD.");
    process.exit(2);
  }

  const statePath = authStatePath();
  const profileDir = browserProfileDir();
  ensureParentDir(path.join(profileDir, ".keep"));
  let context = await chromium.launchPersistentContext(profileDir, {
    channel: process.env.SG_BROWSER_CHANNEL || "chromium",
    headless: isHeadless(),
    viewport: { width: 1366, height: 900 }
  });
  let page = context.pages()[0] || (await context.newPage());

  try {
    let auth = await checkAuthenticatedSession(page);
    let usedSavedSession = auth.authenticated;

    if (!usedSavedSession) {
      auth = await loginAndClassify(page, email, password);

      if (auth.state === "authenticated") {
        ensureParentDir(statePath);
        await context.storageState({ path: statePath });
      } else if (auth.state === "challenge_required" || auth.state === "pending_2fa" || auth.state === "login_page_timeout") {
        const shouldRetry = await promptRetryIfInteractive(
          "SiteGround challenge detected. Complete it in your browser/session, then retry now?"
        );
        if (shouldRetry) {
          auth = await loginAndClassify(page, email, password);
          if (auth.state === "authenticated") {
            ensureParentDir(statePath);
            await context.storageState({ path: statePath });
          }
        }
      }
    }

    if (args.screenshot && page) await page.screenshot({ path: args.screenshot, fullPage: true });

    if (auth.state !== "authenticated") {
      const prompt =
        auth.state === "challenge_required" || auth.state === "pending_2fa" || auth.state === "login_page_timeout"
          ? "Automatic login hit a challenge/verification step. Run `secrets run -- npm run sg-auth` to open a browser window, complete challenge/2FA, then rerun the read command."
          : null;
      console.log(
        JSON.stringify(
          {
            ok: false,
            action: args.action,
            state: auth.state,
            url: auth.url,
            loginStatus: auth.loginStatus,
            readOnly: true,
            prompt,
            nextCommand: "secrets run -- npm run sg-auth",
            continueCommand: `secrets run -- npm run sg-read -- ${args.action}${args.site ? ` --site ${args.site}` : ""}`,
            authStatePath: statePath,
            usedSavedSession,
            elapsedMs: Date.now() - started,
            screenshotPath: args.screenshot || null
          },
          null,
          2
        )
      );
      return;
    }

    if (args.action === "list-sites") {
      const result = await listSites(page);
      console.log(
        JSON.stringify(
          {
            ok: true,
            action: args.action,
            state: auth.state,
            authStatePath: statePath,
            usedSavedSession,
            url: page.url(),
            ...result,
            elapsedMs: Date.now() - started,
            screenshotPath: args.screenshot || null
          },
          null,
          2
        )
      );
      return;
    }

    // list-ssh-keys
    let site = args.site;
    if (!site) {
      const sites = await listSites(page);
      if (sites.count === 1) {
        site = sites.sites[0];
      } else {
        console.log(
          JSON.stringify(
            {
              ok: false,
              action: args.action,
              state: "site_required",
              message: "Provide --site when multiple or no sites are detected.",
              sitesDetected: sites.sites,
              readOnly: true,
              authStatePath: statePath,
              usedSavedSession,
              elapsedMs: Date.now() - started
            },
            null,
            2
          )
        );
        return;
      }
    }

    const result = await listSshKeys(page, site);
    console.log(
      JSON.stringify(
        {
          ok: true,
          action: args.action,
          state: auth.state,
          authStatePath: statePath,
          usedSavedSession,
          url: page.url(),
          ...result,
          elapsedMs: Date.now() - started,
          screenshotPath: args.screenshot || null
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
          action: args.action,
          state: "error",
          error: String(error),
          readOnly: true,
          elapsedMs: Date.now() - started
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } finally {
    if (context) await context.close();
  }
}

await main();
