// Favicon on every surface (public site, customer account, CMS, floorplan) and the public map: available booths filled
// with their booth-category colour (no hatching), legend by category.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {BASE} from "./lib.mjs";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const SITE = process.env.E2E_SITE_URL;
const skip = !chromium ? "playwright not installed" : !SITE ? "E2E_FRONTEND_DIR not set" : false;

test("favicon everywhere; public map uses category colours instead of hatching", {skip}, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const url of [SITE + "/", SITE + "/exhibitors/", SITE + "/news/article/?slug=x", SITE + "/zh/about/", BASE + "/floorplan", BASE + "/account", BASE + "/admin"]) {
      await page.goto(url, {waitUntil: "domcontentloaded"});
      const href = await page.locator('link[rel="icon"]').first().getAttribute("href");
      assert.match(href || "", /imd-favicon-orange\.png/, "favicon link on " + url);
    }
    const ico = await fetch(SITE + "/favicon.ico"); assert.equal(ico.status, 200, "/favicon.ico");
    const png = await fetch(SITE + "/assets/imd-favicon-orange.png"); assert.equal(png.status, 200);
    // Public map (if a floor is live): no hatch pattern, available booths use a solid fill, legend lists categories.
    await page.goto(SITE + "/floorplan"); await page.waitForTimeout(1500);
    if (await page.locator(".floorplan-viewer svg").count()) {
      assert.equal(await page.locator("pattern#fp-avail").count(), 0, "no hatching");
      const fills = await page.locator('.floorplan-viewer svg g[role="button"] rect').evaluateAll(r => r.map(x => x.getAttribute("fill")));
      assert.ok(fills.length && fills.every(f => /^#[0-9a-f]{6}$/i.test(f || "")), "solid fills: " + fills.slice(0, 5));
      assert.ok(await page.locator(".fp-legend .fp-chip").count() >= 2, "legend chips");
    }
  } finally { await browser.close(); }
});
