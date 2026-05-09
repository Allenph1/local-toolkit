import { chromium } from "@playwright/test";

function parseArgs() {
  const out = {};
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === "--url") out.url = process.argv[i + 1];
    if (arg === "--screenshot") out.screenshot = process.argv[i + 1];
  }
  if (!out.url) {
    console.error("Usage: npm run probe -- --url https://example.com [--screenshot out.png]");
    process.exit(2);
  }
  return out;
}

const { url, screenshot } = parseArgs();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const started = Date.now();

try {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  const title = await page.title();
  const elapsedMs = Date.now() - started;

  if (screenshot) {
    await page.screenshot({ path: screenshot, fullPage: true });
  }

  console.log(JSON.stringify({
    ok: true,
    url,
    title,
    status: response ? response.status() : null,
    elapsedMs
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    url,
    error: String(error)
  }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
