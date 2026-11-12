// Page banners: photo, title and subtitle of every page (static pages + /floorplan) are edited in CMS › Pages & layout
// and always stay first; About Organizer page and its navbar link; View Venue Details on Visitors.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {adminLogin, BASE} from "./lib.mjs";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const SITE = process.env.E2E_SITE_URL;
const skip = !chromium ? "playwright not installed" : !SITE ? "E2E_FRONTEND_DIR not set" : false;
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));

test("page banners editable in the CMS (static pages and /floorplan); About Organizer page", {skip, timeout: 180000}, async () => {
  const ED = await adminLogin("CONTENT_EDITOR");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}}); const errors = []; page.on("pageerror", e => errors.push(e.message));
    // Every inner page has a banner with a CMS photo, title and subtitle.
    for (const p of ["about", "about-organizer", "contact", "exhibition", "exhibitors", "highlights", "news", "partners", "programme", "the-venue", "visitors"]) {
      await page.goto(SITE + "/" + p + "/");
      const hero = page.locator('[data-cms-block="page-hero"]');
      assert.equal(await hero.locator('img[data-cms-f="page-hero.0"]').count(), 1, p + ": banner photo field");
      assert.equal(await hero.locator('h1[data-cms-f="page-hero.1"]').count(), 1, p + ": banner title field");
      const fields = (await ED.get(`/api/admin/pages/${p}`)).body.fields["page-hero"]; assert.ok(fields.length >= 3, p + ": CMS knows the banner");
    }
    // Publish a banner change on Visitors (with a layout that reorders sections): the banner changes and stays first.
    const d = (await ED.get("/api/admin/pages/visitors")).body;
    const layout = {...d.draft, blocks: [...d.draft.blocks].reverse(), fields: {...(d.draft.fields || {}), "page-hero.0": {src: "/assets/industry-05.webp", alt: "Smart mining 2028"}, "page-hero.1": {mode: "plain", text: "Visit IMDX 2028"}, "page-hero.2": {mode: "plain", text: "Updated subtitle"}}};
    ok(await ED.req("PUT", "/api/admin/pages/visitors", layout), 200, "draft"); ok(await ED.post("/api/admin/pages/visitors/publish", {reason: "E2E banner change"}), 200, "publish");
    const fresh = await (await browser.newContext({viewport: {width: 1280, height: 900}})).newPage();
    await fresh.goto(SITE + "/visitors/?v=" + Date.now());
    await fresh.waitForFunction(() => document.querySelector('[data-cms-f="page-hero.1"]')?.textContent === "Visit IMDX 2028", null, {timeout: 10000});
    assert.match(await fresh.locator('img[data-cms-f="page-hero.0"]').getAttribute("src"), /industry-05\.webp$/);
    assert.equal(await fresh.locator(".page-hero-sub").textContent(), "Updated subtitle");
    assert.equal(await fresh.evaluate(() => { const h = document.querySelector('[data-cms-block="page-hero"]'); return !!h && getComputedStyle(h).display !== "none" && h === document.querySelector("main").firstElementChild; }), true, "banner visible and first");
    ok(await ED.post("/api/admin/pages/visitors/rollback", {version: 0, reason: "Restore design after banner test"}), 200, "rollback visitors");
    // /floorplan banner (app page) — same look, CMS-editable.
    await page.goto(BASE + "/floorplan"); await page.locator(".app-page-hero h1").waitFor();
    assert.equal(await page.locator(".app-page-hero h1").textContent(), "Exhibition Floorplan");
    assert.equal(await page.locator(".app-page-hero .breadcrumb a").getAttribute("href"), "/");
    const fd = (await ED.get("/api/admin/pages/floorplan")).body; assert.equal(fd.path, "/floorplan"); assert.equal(fd.fields["page-hero"].length, 3);
    ok(await ED.req("PUT", "/api/admin/pages/floorplan", {...fd.draft, fields: {"page-hero.1": {mode: "plain", text: "Booth map 2028"}}}), 200, "floorplan draft");
    ok(await ED.post("/api/admin/pages/floorplan/publish", {reason: "E2E floorplan banner"}), 200, "floorplan publish");
    await page.goto(BASE + "/floorplan?v=" + Date.now()); await page.waitForFunction(() => document.querySelector(".app-page-hero h1")?.textContent === "Booth map 2028", null, {timeout: 10000});
    ok(await ED.post("/api/admin/pages/floorplan/rollback", {version: 0, reason: "Restore floorplan banner"}), 200, "rollback floorplan");
    // About Organizer (owner brief, + photo banner on request): banner, logo panel, one group-metrics strip, three cards,
    // commitment banner, Why Indonesia; ICEE 2025 figures phrased as plans, metrics labelled as group-level.
    await page.goto(SITE + "/about-organizer/");
    assert.equal(await page.locator("h1").count(), 1); assert.equal(await page.locator("h1").textContent(), "About the Organizer");
    assert.equal(await page.locator('.page-hero img.page-hero-bg[data-cms-f="page-hero.0"]').count(), 1, "photo banner like the other pages (CMS-editable)");
    assert.deepEqual(await page.locator(".page-hero .breadcrumb li").allTextContents(), ["Home", "About", "About the Organizer"]);
    assert.deepEqual(await page.locator(".og2-logos img").evaluateAll(i => i.map(x => x.getAttribute("alt"))), ["PT Seesion Exhibition Indonesia logo", "Shixin International Exhibition Group logo"]);
    assert.equal(await page.locator(".og2-stats li").count(), 5); assert.match(await page.locator(".og2-stats-label").textContent(), /Shixin Group track record/);
    assert.deepEqual(await page.locator(".og2-cards h3").allTextContents(), ["Organizer Profile", "Track Record", "Strategic Cooperation"]);
    assert.match(await page.locator(".og2-cards li").nth(1).textContent(), /was scheduled for 15–17 May 2025.*published plan targeted/);
    assert.doesNotMatch(await page.locator("main").textContent(), /successfully held|welcomed 20,000|30 years/i);
    assert.equal(await page.locator(".og2-commit h2").textContent(), "Connecting China and ASEAN");
    assert.deepEqual(await page.locator(".og2-why-cards h3").allTextContents(), ["Economy", "Culture & Society", "Coal Resources"]);
    assert.equal(await page.locator(".og2-sec img:not(.og2-logos img)").count(), 0, "no photo sections");
    for (const w of [390, 820]) { await page.setViewportSize({width: w, height: 900}); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, "no overflow at " + w); }
    await page.setViewportSize({width: 1280, height: 900});
    await page.goto(SITE + "/"); assert.equal(await page.locator('[data-cms-site="header"] a[href="about-organizer/"]').textContent(), "About Organizer");
    await page.goto(BASE + "/floorplan"); assert.equal(await page.locator('.imdx-site-header a[href="/about-organizer/"]').count(), 1);
    // CMS picker lists the new pages.
    const names = (await ED.get("/api/admin/pages")).body.pages.map(p => p.key);
    assert.ok(names.includes("about-organizer") && names.includes("floorplan"));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
