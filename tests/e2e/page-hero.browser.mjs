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
    // Photo cards (no icons) and the intro photo ends where the cards end (same right edge).
    assert.equal(await page.locator(".xb-why-cards li img").count(), 3); assert.equal(await page.locator(".xb-scope-cards li img").count(), 8);
    assert.equal(await page.locator(".xb-why-cards .xb-ico, .xb-scope-cards .xb-ico").count(), 0);
    const edge = sel => page.locator(sel).first().evaluate(e => Math.round(e.getBoundingClientRect().right));
    assert.ok(Math.abs(await edge(".xb-intro-photo") - await edge(".xb-why-cards li:last-child")) <= 2, "intro photo aligned with the cards");
    // Downloads: only files published in CMS › Downloads (see exhibitor-downloads.browser.mjs).
    // Visitors (owner mockup): intro + Register as Visitor, at a glance, why visit, 8 scope tiles, FAQ (#faq), plan-your-visit CTA.
    await page.goto(SITE + "/visitors/");
    assert.match(await page.locator("#vs-intro-h").textContent(), /Explore Solutions/);
    assert.equal(await page.locator('button[data-action="register"].vs-btn').count(), 2, "two Register as Visitor buttons");
    assert.equal(await page.locator(".vs-glance-facts li").count(), 2); assert.equal(await page.locator(".vs-why-cards li").count(), 4);
    assert.equal(await page.locator('.vs-glance a.vs-venue-btn[href="../the-venue/"]').textContent().then(t => t.trim().startsWith("View Venue Details")), true, "venue button");
    assert.equal(await page.locator(".vs-tiles li").count(), 8);
    { const edge = sel => page.locator(sel).first().evaluate(e => Math.round(e.getBoundingClientRect().right));
      assert.ok(Math.abs(await edge(".xb-intro-photo") - await edge(".vs-why-cards li:last-child")) <= 2, "visitors intro photo aligned with the cards"); }
    const faq = page.locator("#faq .vs-faq-list details"); assert.equal(await faq.count(), 5);
    assert.equal(await faq.first().getAttribute("open"), "", "first answer open");
    await faq.nth(1).locator("summary").click(); assert.equal(await faq.nth(1).getAttribute("open"), "");
    assert.equal(await page.locator('#faq a[href="../the-venue/"]').count(), 1);
    assert.equal(await page.getByText("From interest to").count(), 0, "old journey section removed");
    await page.locator('button[data-action="register"].vs-btn').first().click(); await page.locator(".auth-popup").waitFor();
    await page.keyboard.press("Escape");
    // About (Event Overview mockup): 01 copy + Join buttons + photo, Event Information card, 03 audience photo cards, 04, 05.
    await page.goto(SITE + "/about/");
    const ov = page.locator('[data-cms-block="where-possibility-meets"]');
    assert.match(await ov.locator("#aboutExhibitionTitle").textContent(), /One platform\./);
    assert.deepEqual((await ov.locator(".ov-num").allTextContents()), ["01", "03", "04", "05"]);
    assert.equal(await ov.locator('.ov-actions button[data-action="exhibitor"]').count(), 1); assert.equal(await ov.locator('.ov-actions button[data-action="register"]').count(), 1);
    assert.equal(await ov.locator(".ov-intro-photo img").count(), 1); assert.equal(await ov.locator(".ov-event .vs-glance-facts li").count(), 2);
    assert.equal(await ov.locator(".ov-chain, .ov-steps, .ov-facts").count(), 0, "value chain band and facts card removed");
    assert.equal(await ov.locator(".ov-aud-cards li img").count(), 3); assert.equal(await ov.locator(".ov-happen-cards li").count(), 3);
    assert.equal(await ov.locator(".ov-past-photos img").count(), 4); assert.equal(await ov.locator('.ov-past-link[href="../highlights/"]').count(), 1);
    assert.equal(await page.locator(".intro-showcase").count(), 0, "showcase banner removed");
    assert.equal(await ov.locator('[data-cms-f="where-possibility-meets.14"]').textContent(), "26 – 28 May 2027", "date keeps its CMS key");
    // 中文
    await page.goto(SITE + "/zh/exhibitors/");
    assert.equal(await page.locator("h1").textContent(), "参展商"); assert.equal(await page.locator(".page-hero .breadcrumb a").textContent(), "首页");
    assert.equal(await page.locator(".page-hero .breadcrumb a").getAttribute("href"), "/zh/");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test("The Venue: JIEXPO site map under the aerial photo, CMS-editable, opens full size", {skip}, async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({viewport: {width, height: 900}});
      await page.goto(SITE + "/the-venue/");
      const map = page.locator(".venue-story-media .venue-site-map img");
      assert.equal(await map.getAttribute("data-cms-f"), "jakarta-international-expo-jiexpo-kemayo.100");
      assert.match(await map.getAttribute("alt"), /site map/i);
      assert.match(await page.locator(".venue-site-map a").getAttribute("href"), /jiexpo-site-map\.webp$/);
      await map.scrollIntoViewIfNeeded(); await page.waitForFunction(() => document.querySelector(".venue-site-map img")?.complete);
      assert.ok(await map.evaluate(i => i.naturalWidth > 0), "site map image loads");
      const [photo, siteMap] = [await page.locator(".venue-story-media .venue-story-photo").boundingBox(), await map.boundingBox()];
      assert.ok(siteMap.y > photo.y + photo.height - 1, "site map sits under the aerial photo at " + width);
      assert.ok(Math.abs(siteMap.width - photo.width) < 2, "same width as the aerial photo at " + width);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal overflow at " + width);
      // Click to enlarge: lightbox on the same page, toggles full size, closes with Esc and returns focus.
      await page.locator(".venue-site-map a").click();
      const box = page.locator(".zoom-lightbox");
      await box.waitFor({state: "visible"}); assert.equal(page.url(), SITE + "/the-venue/", "stays on the page");
      assert.match(await box.locator("img").getAttribute("src"), /jiexpo-site-map\.webp/);
      const fit = (await box.locator("img").boundingBox()).width;
      assert.ok(fit > width * 0.6, "enlarged image is bigger than the thumbnail at " + width);
      await box.locator("img").click(); assert.ok((await box.locator("img").boundingBox()).width > fit, "click zooms to full size");
      await page.keyboard.press("Escape"); await box.waitFor({state: "hidden"});
      assert.equal(await page.evaluate(() => document.activeElement?.closest(".venue-site-map") !== null), true, "focus returns to the map");
      await page.locator(".venue-site-map a").click(); await box.waitFor({state: "visible"});
      await box.locator(".zoom-close").click(); await box.waitFor({state: "hidden"});
      await page.locator(".venue-story-media .venue-story-photo a[data-zoom]").click(); await box.waitFor({state: "visible"});
      assert.match(await box.locator("img").getAttribute("src"), /jiexpo-kemayoran-aerial/, "aerial photo enlarges too");
      await page.keyboard.press("Escape"); await box.waitFor({state: "hidden"});
      await page.close();
    }
  } finally { await browser.close(); }
});
