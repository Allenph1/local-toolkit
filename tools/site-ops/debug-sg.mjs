#!/usr/bin/env node
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

try {
  console.log("Loading SiteGround...");
  await page.goto("https://my.siteground.com", { waitUntil: "networkidle", timeout: 30000 });
  
  console.log("Taking screenshot...");
  await page.screenshot({ path: "/tmp/siteground-login.png", fullPage: true });
  
  console.log("Inspecting page...");
  const html = await page.content();
  const emailInputs = await page.locator("input[type='email']").count();
  const passwordInputs = await page.locator("input[type='password']").count();
  const allInputs = await page.locator("input").count();
  
  console.log(`Email inputs: ${emailInputs}`);
  console.log(`Password inputs: ${passwordInputs}`);
  console.log(`Total inputs: ${allInputs}`);
  
  // Log all input selectors
  const inputs = page.locator("input");
  for (let i = 0; i < Math.min(10, await inputs.count()); i++) {
    const inp = inputs.nth(i);
    const type = await inp.getAttribute("type");
    const name = await inp.getAttribute("name");
    const placeholder = await inp.getAttribute("placeholder");
    console.log(`  [${i}] type=${type}, name=${name}, placeholder=${placeholder}`);
  }
  
  // Log page title and URL
  console.log(`Title: ${await page.title()}`);
  console.log(`URL: ${page.url()}`);
  
} catch (error) {
  console.error("Debug error:", error);
} finally {
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
}
