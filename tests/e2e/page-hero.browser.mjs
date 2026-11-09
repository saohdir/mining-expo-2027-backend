// Design CR (Nov 2026): one compact hero on the public inner pages (single breadcrumb, h1, subtitle, 中文), light variant on the legal pages,
// and the compact Why Exhibit block on /exhibitors/ (CMS keys make-your-next-connection.9–.17 unchanged, cards not interactive).
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const SITE = process.env.E2E_SITE_URL;
const skip = !chromium ? "playwright not installed" : !SITE ? "E2E_FRONTEND_DIR not set" : false;
const HERO = {about: "About the Exhibition", contact: "Contact Us", exhibition: "Exhibition Scope", exhibitors: "Exhibitors", highlights: "Event Highlight", news: "News & Updates",
  partners: "Partners", programme: "Conferences", "the-venue": "The Venue", visitors: "Visitor Information"};

test("compact page hero on inner pages + Why Exhibit block", {skip}, async () => {
  const browser = await chromium.launch();
  try {
    const errors = [];
    for (const width of [320, 768, 1440]) {
      const ctx = await browser.newContext({viewport: {width, height: 900}});
      for (const [slug, title] of Object.entries(HERO)) {
        const page = await ctx.newPage(); page.on("pageerror", e => errors.push(slug + ": " + e.message));
        await page.goto(`${SITE}/${slug}/`);
        const r = await page.evaluate(() => ({h1: [...document.querySelectorAll("h1")].map(h => h.textContent.trim()), crumbs: document.querySelectorAll(".breadcrumb").length,
          inHero: !!document.querySelector(".page-hero h1"), sub: !!document.querySelector(".page-hero .page-hero-sub")?.textContent.trim(),
          heroH: document.querySelector(".page-hero").getBoundingClientRect().height, overflow: document.documentElement.scrollWidth - innerWidth}));
        assert.deepEqual(r.h1, [title], `${slug}@${width}: one h1`); assert.equal(r.crumbs, 1, `${slug}@${width}: one breadcrumb`);
        assert.ok(r.inHero && r.sub, slug + ": h1 + subtitle in the hero"); assert.ok(r.heroH >= 140 && r.heroH <= 240, `${slug}@${width}: compact hero ${r.heroH}`);
        assert.ok(r.overflow <= 1, `${slug}@${width}: no horizontal scroll`);
        await page.close();
      }
      await ctx.close();
    }
    const page = await browser.newPage({viewport: {width: 1440, height: 900}}); page.on("pageerror", e => errors.push(e.message));
    // Legal pages: light breadcrumb band, the CMS h1 stays the only title.
    await page.goto(SITE + "/privacy/");
    assert.equal(await page.locator(".page-hero--light .breadcrumb").count(), 1); assert.equal(await page.locator("h1").count(), 1);
    // Exhibitors: breadcrumb link reachable by keyboard; Why Exhibit keeps its CMS keys and has no hover/click affordance.
    await page.goto(SITE + "/exhibitors/");
    await page.locator(".page-hero .breadcrumb a").focus(); assert.equal(await page.evaluate(() => document.activeElement.textContent), "Home");
    for (let n = 9; n <= 17; n++) assert.equal(await page.locator(`.why-exhibit [data-cms-f="make-your-next-connection.${n}"]`).count(), 1, "field ." + n);
    assert.equal(await page.locator(".why-exhibit-list li").count(), 3); assert.equal(await page.locator(".why-exhibit-list a, .why-exhibit-list button").count(), 0);
    const li = page.locator(".why-exhibit-list li").first(), before = await li.boundingBox(); await li.hover();
    assert.equal((await li.boundingBox()).y, before.y, "cards do not lift on hover");
    // 中文
    await page.goto(SITE + "/zh/exhibitors/");
    assert.equal(await page.locator("h1").textContent(), "参展商"); assert.equal(await page.locator(".page-hero .breadcrumb a").textContent(), "首页");
    assert.equal(await page.locator(".why-kicker").textContent(), "为何参展");
    assert.equal(await page.locator(".page-hero .breadcrumb a").getAttribute("href"), "/zh/");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
