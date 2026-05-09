#!/usr/bin/env node
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const started = Date.now();

try {
  console.log("Navigating to SiteGround...");
  await page.goto("https://my.siteground.com", { waitUntil: "domcontentloaded", timeout: 30000 });

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
  await page.locator("input[name='username']").fill("jdwipplinger@gmail.com");
  await page.locator("input[name*='password']").fill("DM456lm67#");

  console.log("Clicking login...");
  await page.locator("button:has-text('Login'):not(:has-text('Google'))").click();

  console.log("Waiting for navigation after login...");
  await page.waitForNavigation({ timeout: 15000 }).catch(() => console.log("No navigation, checking for 2FA page"));

  console.log(`URL: ${page.url()}`);
  console.log(`Title: ${await page.title()}`);
  
  const content = await page.content();
  if (content.includes("verification") || content.includes("code") || content.includes("2FA")) {
    console.log("✓ 2FA/verification page detected");
  }

  console.log("Waiting 60s for 2FA completion or dashboard...");
  const result = await Promise.race([
    page.waitForFunction(
      () => window.location.href.includes("siteground.com") && !window.location.href.includes("login"),
      { timeout: 60000 }
    ).then(() => "authenticated"),
    page.waitForTimeout(60000).then(() => "timeout")
  ]);

  console.log(`Result: ${result}`);
  const title = await page.title();
  const url = page.url();
  
  console.log(JSON.stringify({
    ok: result === "authenticated",
    title,
    url,
    elapsedMs: Date.now() - started
  }, null, 2));

} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    error: String(error),
    elapsedMs: Date.now() - started
  }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
