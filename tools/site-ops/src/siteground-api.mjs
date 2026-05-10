#!/usr/bin/env node
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";

function parseArgs() {
  const out = { action: "" };
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (!arg.startsWith("--") && !out.action) out.action = arg;
    if (arg === "--match") out.match = process.argv[i + 1] || "";
    if (arg === "--method") out.method = (process.argv[i + 1] || "GET").toUpperCase();
    if (arg === "--url") out.url = process.argv[i + 1] || "";
    if (arg === "--data") out.data = process.argv[i + 1] || "";
  }
  return out;
}

function dataDir() {
  return path.resolve(process.cwd(), ".data");
}

function browserProfileDir() {
  return process.env.SG_BROWSER_PROFILE_DIR || path.resolve(process.cwd(), ".data/sg-browser-profile");
}

function apiLogPath() {
  return path.resolve(dataDir(), "siteground-api-calls.json");
}

function authStatePath() {
  return process.env.SITEGROUND_AUTH_STATE || path.resolve(dataDir(), "siteground-auth.json");
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

async function openContext(headless = false) {
  const profileDir = browserProfileDir();
  ensureParentDir(path.join(profileDir, ".keep"));
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: process.env.SG_BROWSER_CHANNEL || "chromium",
    headless,
    viewport: { width: 1366, height: 900 }
  });
  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

async function ensureAuthenticated(page) {
  await page.goto("https://my.siteground.com", { waitUntil: "domcontentloaded", timeout: 60000 });
  const url = page.url();
  if (url.includes("my.siteground.com") && !url.includes("login")) return true;
  return false;
}

async function waitForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question(prompt);
  } finally {
    rl.close();
  }
}

async function actionCapture(args) {
  const { context, page } = await openContext(false);
  const calls = [];

  page.on("requestfinished", async (request) => {
    const url = request.url();
    if (!url.includes("siteground")) return;
    if (!["xhr", "fetch"].includes(request.resourceType())) return;
    let status = null;
    try {
      const response = await request.response();
      status = response ? response.status() : null;
    } catch {}
    calls.push({
      ts: new Date().toISOString(),
      method: request.method(),
      url,
      resourceType: request.resourceType(),
      status
    });
  });

  try {
    await page.goto(args.url || "https://my.siteground.com/paneladmin/sites", { waitUntil: "domcontentloaded", timeout: 60000 });
    console.log("Perform your SiteGround UI flow now in this same window. Press Enter here when done...");
    await waitForEnter("");
    await context.storageState({ path: authStatePath() });

    const uniq = [];
    const seen = new Set();
    for (const c of calls) {
      const k = `${c.method} ${c.url}`;
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(c);
    }
    saveJson(apiLogPath(), uniq);
    console.log(JSON.stringify({ ok: true, callsCaptured: uniq.length, apiLogPath: apiLogPath(), authStatePath: authStatePath() }, null, 2));
  } finally {
    await context.close();
  }
}

async function actionList() {
  const calls = loadJson(apiLogPath(), []);
  const summarized = calls.map((c, idx) => ({
    idx,
    method: c.method,
    status: c.status,
    url: c.url
  }));
  console.log(JSON.stringify({ ok: true, count: summarized.length, calls: summarized }, null, 2));
}

async function actionCall(args) {
  const calls = loadJson(apiLogPath(), []);
  if (!calls.length) {
    console.log(JSON.stringify({ ok: false, error: "No captured API calls. Run: npm run sg-api -- capture" }, null, 2));
    process.exitCode = 1;
    return;
  }

  const pattern = args.match || "";
  const target = pattern
    ? calls.find((c) => c.url.includes(pattern) || `${c.method} ${c.url}`.includes(pattern))
    : calls[0];

  if (!target) {
    console.log(JSON.stringify({ ok: false, error: `No call matched: ${pattern}` }, null, 2));
    process.exitCode = 1;
    return;
  }

  const { context, page } = await openContext(true);
  try {
    const authOk = await ensureAuthenticated(page);
    if (!authOk) {
      console.log(JSON.stringify({ ok: false, error: "Session not authenticated. Run sg-auth/sg-live-capture first." }, null, 2));
      process.exitCode = 1;
      return;
    }

    const method = args.method || target.method || "GET";
    const postData = args.data || undefined;
    const response = await context.request.fetch(target.url, {
      method,
      data: postData
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 8000);
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          request: { method, url: target.url },
          status: response.status(),
          headers: response.headers(),
          body
        },
        null,
        2
      )
    );
  } finally {
    await context.close();
  }
}

async function main() {
  const args = parseArgs();
  const action = args.action || "help";
  if (action === "capture") return actionCapture(args);
  if (action === "list-calls") return actionList(args);
  if (action === "call") return actionCall(args);
  console.error("Usage: npm run sg-api -- <capture|list-calls|call> [--match text] [--method GET|POST] [--url startUrl] [--data raw]");
  process.exit(2);
}

await main();
