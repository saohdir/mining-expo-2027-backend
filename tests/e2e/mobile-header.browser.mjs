// Mobile header (owner prompts 01/02): REGISTER / MY PASS spans the drawer's content width like the menu rows, and
// EN / 中文 sits in the always-visible header beside the hamburger instead of inside the drawer. Desktop is unchanged.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {BASE} from "./lib.mjs";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const SITE = process.env.E2E_SITE_URL;
const skip = !chromium ? "playwright not installed" : !SITE ? "E2E_FRONTEND_DIR not set" : false;
const box = (page, sel) => page.locator(sel).first().evaluate(e => { const r = e.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height, right: r.right}; });

test("mobile header: full-width register CTA, language switch beside the hamburger", {skip}, async () => {
  const browser = await chromium.launch();
  try {
    for (const path of ["/", "/exhibitors/"]) for (const width of [320, 360, 375, 390, 430]) {
      const page = await browser.newPage({viewport: {width, height: 800}});
      await page.goto(SITE + path);
      const lang = page.locator(".site-nav-shell .nav > .lang-switch");
      await lang.waitFor();
      assert.equal(await page.locator("#navLinks .lang-switch").count(), 0, `no switch inside the drawer ${path}@${width}`);
      const [logo, sw, tg] = [await box(page, ".site-nav-shell .official-brand-logo"), await box(page, ".site-nav-shell .nav > .lang-switch"), await box(page, "#navToggle")];
      assert.ok(logo.right <= sw.x && sw.right <= tg.x, `logo | EN 中文 | menu in order without overlap ${path}@${width}`);
      assert.ok(Math.abs((sw.y + sw.h / 2) - (tg.y + tg.h / 2)) < 4, `same line ${path}@${width}`);
      assert.equal(await page.locator('.lang-switch button[aria-pressed="true"]').textContent(), "EN");
      await page.click("#navToggle");
      const [cta, row] = [await box(page, ".site-nav-shell .nav-login"), await box(page, "#navLinks .nav-menu > a")];
      assert.ok(Math.abs(cta.x - row.x) < 1.5 && Math.abs(cta.w - row.w) < 1.5, `CTA as wide as the menu rows ${path}@${width}: ${cta.w} vs ${row.w}`);
      assert.ok(cta.h >= 44, "touch-friendly height");
      assert.ok(await lang.isVisible(), "switch stays visible with the drawer open");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal scroll ${path}@${width}`);
      await page.close();
    }
    // Switching language from the header keeps the page; desktop keeps the switch at the end of the links.
    const page = await browser.newPage({viewport: {width: 375, height: 800}});
    await page.goto(SITE + "/exhibitors/");
    await page.locator(".site-nav-shell .nav > .lang-switch button", {hasText: "中文"}).click();
    await page.waitForURL(/\/zh\/exhibitors\/$/);
    assert.equal(await page.locator('.lang-switch button[aria-pressed="true"]').textContent(), "中文");
    await page.setViewportSize({width: 1280, height: 800}); await page.waitForTimeout(200);
    assert.equal(await page.locator("#navLinks .lang-switch").count(), 1, "desktop: inside the link bar as before");
    assert.equal(await page.locator(".lang-switch").count(), 1, "never duplicated");
    await page.locator('.lang-switch button[lang="en"]').click(); await page.waitForURL(/\/exhibitors\/$/);
    await page.close();
    // App pages (account, floorplan) share the same full-width CTA in their mobile drawer.
    const app = await browser.newPage({viewport: {width: 360, height: 800}});
    await app.goto(BASE + "/floorplan"); await app.click(".imdx-menu-toggle");
    const [a, r] = [await box(app, ".imdx-primary-links .imdx-account-link"), await box(app, ".imdx-primary-links .imdx-main-link")];
    assert.ok(Math.abs(a.x - r.x) < 1.5 && Math.abs(a.w - r.w) < 1.5, `app CTA full width: ${a.w} vs ${r.w}`);
    await app.close();
  } finally { await browser.close(); }
});
