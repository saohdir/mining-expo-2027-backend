// Design CR (Nov 2026): one compact hero on the public inner pages (single breadcrumb, h1, subtitle, 中文), light variant on the legal pages,
// and the redesigned /exhibitors/ page (owner mockup).
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
    // Exhibitors (owner mockup): intro + photo, Why exhibit (3 icon cards), 8 scope cards, reserve banner, downloads.
    await page.goto(SITE + "/exhibitors/");
    await page.locator(".page-hero .breadcrumb a").focus(); assert.equal(await page.evaluate(() => document.activeElement.textContent), "Home");
    assert.match(await page.locator("#xb-intro-h").textContent(), /More than a booth\./);
    assert.equal(await page.locator(".xb-why-cards li").count(), 3); assert.equal(await page.locator(".xb-why-cards a, .xb-why-cards button").count(), 0);
    assert.equal(await page.locator(".xb-scope-cards li").count(), 8); assert.equal(await page.locator("#industryPhotoGrid, .industry-modal").count(), 0);
    assert.equal(await page.locator('.xb-reserve a.xb-btn[href="/floorplan"]').count(), 1);
    assert.equal(await page.locator(".xb-dl-cards li").count(), 3);
    // Downloads: a button links only to a published CMS download (else "Coming soon"; see exhibitor-downloads.browser.mjs).
    for (const m of ["brochure", "invitation"]) { const a = page.locator(`a[data-download-match="${m}"]`), href = await a.getAttribute("href");
      assert.equal((await a.textContent()).trim(), href ? "Download PDF" : "Coming soon"); }
    assert.equal(await page.locator('.xb-dl-cards a[href="/floorplan"]').count(), 1);
    // About: overview 01–05 from the owner mockup; the old showcase banner and "Explore the eight sectors" link are gone.
    await page.goto(SITE + "/about/");
    const ov = page.locator('[data-cms-block="where-possibility-meets"]');
    assert.match(await ov.locator("#aboutExhibitionTitle").textContent(), /One platform\./);
    assert.deepEqual((await ov.locator(".ov-num").allTextContents()), ["01", "02", "03", "04", "05"]);
    assert.equal(await ov.locator(".ov-facts li").count(), 3); assert.equal(await ov.locator(".ov-steps li").count(), 5);
    assert.equal(await ov.locator(".ov-aud-cards li").count(), 3); assert.equal(await ov.locator(".ov-happen-cards li").count(), 3);
    assert.equal(await ov.locator(".ov-past-photos img").count(), 4); assert.equal(await ov.locator('.ov-past-link[href="../highlights/"]').count(), 1);
    assert.equal(await page.locator(".intro-showcase").count(), 0, "showcase banner removed");
    assert.equal(await page.getByText("Explore the eight exhibition sectors").count(), 0);
    assert.equal(await ov.locator('[data-cms-f="where-possibility-meets.14"]').textContent(), "26–28 May 2027", "date keeps its CMS key");
    // 中文
    await page.goto(SITE + "/zh/exhibitors/");
    assert.equal(await page.locator("h1").textContent(), "参展商"); assert.equal(await page.locator(".page-hero .breadcrumb a").textContent(), "首页");
    assert.equal(await page.locator(".page-hero .breadcrumb a").getAttribute("href"), "/zh/");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
