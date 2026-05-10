#!/usr/bin/env node
import { chromium } from "@playwright/test";

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
  return [...new Set(matches.map((m) => m.toLowerCase()))].filter((m) => !blocked.has(m));
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

async function listSites(page) {
  await page.goto("https://my.siteground.com/paneladmin/domains", { waitUntil: "domcontentloaded", timeout: 30000 });
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

  const all = [...new Set([...fromText, ...fromHref])].sort();
  return {
    count: all.length,
    sites: all,
    readOnly: true
  };
}

async function listSshKeys(page, site) {
  const encodedSite = encodeURIComponent(site);
  await page.goto(`https://my.siteground.com/paneladmin/sites/${encodedSite}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1000);

  const allText = ((await page.textContent("body")) || "").replace(/\r/g, "");
  const lines = allText.split("\n").map((s) => s.trim()).filter(Boolean);

  const sshLines = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes("ssh") || lower.includes("public key") || lower.includes("fingerprint") || lower.includes("ed25519") || lower.includes("rsa")) {
      sshLines.push(line);
    }
  }

  const keyLike = [];
  for (const line of lines) {
    if (line.startsWith("ssh-rsa ") || line.startsWith("ssh-ed25519 ") || line.includes("SHA256:")) {
      keyLike.push(line);
    }
  }

  const uniqueSshLines = [...new Set(sshLines)].slice(0, 200);
  const uniqueKeyLike = [...new Set(keyLike)].slice(0, 200);

  return {
    site,
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

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const auth = await loginAndClassify(page, email, password);
    if (args.screenshot) await page.screenshot({ path: args.screenshot, fullPage: true });

    if (auth.state !== "authenticated") {
      console.log(
        JSON.stringify(
          {
            ok: false,
            action: args.action,
            state: auth.state,
            url: auth.url,
            loginStatus: auth.loginStatus,
            readOnly: true,
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
    await browser.close();
  }
}

await main();
