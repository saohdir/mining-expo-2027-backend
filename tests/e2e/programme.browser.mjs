// CR-PROGRAMME + Partners (browser): cards → detail pages, 3 per page with ?page= state, Back/Forward, clamping, 0/3/6/7 items,
// detail page (breadcrumb, facts, 404, 中文), XSS-safe rendering, removed sections, viewports; Partners page; CMS edit round-trip.
import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {PrismaClient} from "@prisma/client";
import {adminLogin} from "./lib.mjs";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const SITE = process.env.E2E_SITE_URL;
const skip = !chromium ? "playwright not installed" : !SITE ? "E2E_FRONTEND_DIR not set" : false;
const db = new PrismaClient();
const run = Date.now().toString(36);
const REG = ["mining-downstream-industry-green-mining", "china-indonesia-coal-energy-conference", "indonesia-mining-industry-networking-reception"];
const LEG = ["indonesia-china-coal-energy-conference-reference", "indonesia-clean-coal-green-mining-conference", "indonesia-coal-underground-mining-downstream-processing"];
let before = [];
test.after(async () => {
  const mine = await db.programmeItem.findMany({where: {slug: {contains: run}}, select: {id: true}});
  await db.programmeTranslation.deleteMany({where: {itemId: {in: mine.map(m => m.id)}}}); await db.programmeRevision.deleteMany({where: {itemId: {in: mine.map(m => m.id)}}});
  await db.programmeItem.deleteMany({where: {id: {in: mine.map(m => m.id)}}});
  for (const b of before) await db.programmeItem.update({where: {id: b.id}, data: {status: b.status, editorialStatus: b.editorialStatus}});
  await db.contentItem.deleteMany({where: {slug: {contains: run}}});
  await db.$disconnect();
});
const publishOnly = async slugs => {
  await db.programmeItem.updateMany({where: {slug: {notIn: slugs}, deletedAt: null}, data: {status: "DRAFT"}});
  await db.programmeItem.updateMany({where: {slug: {in: slugs}}, data: {status: "PUBLISHED", editorialStatus: "APPROVED"}});
};

test("programme listing, pagination, detail pages, 中文, removed sections, partners", {skip}, async () => {
  execFileSync("npx", ["tsx", "scripts/seed-programmes.ts", "--confirm"], {stdio: "pipe", env: process.env});
  execFileSync("npx", ["tsx", "scripts/seed-organizers.ts", "--confirm"], {stdio: "pipe", env: process.env});
  execFileSync("npx", ["tsx", "scripts/apply-site-content.ts", "--confirm", "--publish", "--page=programme,partners"], {stdio: "pipe", env: process.env});
  before = await db.programmeItem.findMany({select: {id: true, status: true, editorialStatus: true}});
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({viewport: {width: 1440, height: 900}});
    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    const cards = () => page.locator("[data-programme-grid] .conference-card");
    const titles = () => page.locator("[data-programme-grid] .programme-card-title").allTextContents();
    const status = () => page.locator(".programme-pager-status").textContent();

    // 3 published → one page, no pagination; removed sections absent (EN + 中文, with published CMS layouts).
    await publishOnly(REG);
    await page.goto(SITE + "/programme/");
    await page.locator(".programme-card-title").first().waitFor();
    assert.deepEqual(await titles(), ["Mining Downstream Industry & Green Mining Conference", "China–Indonesia Coal & Energy Conference", "Indonesia Mining Industry Networking Reception"]);
    assert.equal(await page.locator(".programme-pager").isHidden(), true, "no pagination for 3");
    for (const t of ["Confirmed schedule", "See all published programmes"]) assert.equal(await page.getByText(t).count(), 0, t + " removed");
    const w = await cards().evaluateAll(cs => cs.map(c => Math.round(c.getBoundingClientRect().width)));
    const y = await cards().evaluateAll(cs => cs.map(c => Math.round(c.getBoundingClientRect().top)));
    assert.equal(new Set(w).size, 1, "three equal-width cards: " + w); assert.equal(new Set(y).size, 1, "in one row");

    // Image, title and arrow all open the internal detail page (never /account or an external site).
    for (const target of [".conference-card-media", ".programme-card-title", ".conference-card-cta"]) {
      await page.goto(SITE + "/programme/"); await page.locator(".programme-card-title").first().waitFor();
      // Real mouse click at the image / arrow position: the card-wide link receives it (stretched-link pattern).
      await cards().nth(1).locator(target).click({force: target !== ".programme-card-title"});
      await page.waitForURL(/\/programme\/china-indonesia-coal-energy-conference\/$/);
      await page.locator(".programme-detail h1").waitFor();
    }
    assert.equal(await page.locator(".programme-detail h1").textContent(), "China–Indonesia Coal & Energy Conference");
    assert.deepEqual(await page.locator(".programme-crumb li").allTextContents(), ["Home", "Programme", "China–Indonesia Coal & Energy Conference"]);
    assert.equal(await page.locator(".programme-highlights li").count(), 3);
    assert.equal(await page.getByText("Registration details coming soon").count(), 1, "no booking link without a verified conference");
    assert.match(await page.title(), /China–Indonesia Coal & Energy Conference — IMDX 2027/);
    assert.match(await page.locator('link[rel="canonical"]').getAttribute("href"), /\/programme\/china-indonesia-coal-energy-conference\/$/);
    assert.equal(await page.locator('link[rel="alternate"][hreflang="zh-Hans"]').count(), 1);
    await page.getByRole("link", {name: /Back to all programmes/}).click(); await page.waitForURL(/\/programme\/(\?page=1)?$/);

    // 6 published (3 regular + 3 ICEE reference, in that order) → 2 pages; ?page state, Back/Forward, clamp.
    await publishOnly([...REG, ...LEG]);
    await page.goto(SITE + "/programme/"); await page.locator(".programme-card-title").first().waitFor();
    assert.equal(await status(), "Page 1 of 2");
    assert.equal(await page.getByRole("button", {name: "Previous page"}).isDisabled(), true);
    await page.getByRole("button", {name: "Page 2"}).click();
    await page.waitForURL(/\?page=2$/);
    assert.deepEqual((await titles()).map(t => t.slice(0, 20)), ["Indonesia–China Coal", "Indonesia Clean Coal", "Indonesia Coal Confe"]);
    assert.equal(await page.locator(".programme-ref-badge").count(), 3, "reference label on legacy cards");
    assert.equal(await page.getByRole("button", {name: "Page 2"}).getAttribute("aria-current"), "page");
    assert.equal(await page.getByRole("button", {name: "Next page"}).isDisabled(), true);
    assert.equal(await page.evaluate(() => document.activeElement?.className), "programme-card-title", "focus moves to the first card of the new page");
    await page.goBack(); await page.waitForFunction(() => document.querySelector(".programme-pager-status")?.textContent === "Page 1 of 2");
    await page.goForward(); await page.waitForFunction(() => document.querySelector(".programme-pager-status")?.textContent === "Page 2 of 2");
    // Detail → back keeps the page.
    await cards().first().locator(".programme-card-title").click(); await page.locator(".programme-detail h1").waitFor();
    assert.equal(await page.locator(".programme-ref-badge").count(), 1); assert.equal(await page.locator(".programme-source a").getAttribute("href"), "https://www.iceeind.com/activity/info.html?id=4");
    assert.equal(await page.locator(".programme-facts dd.is-tba").count(), 4, "source-reported date/venue/fee are not shown as official");
    assert.equal(await page.getByRole("link", {name: /Back to all programmes/}).getAttribute("href"), "/programme/?page=2");
    for (const [q, want] of [["999", "2"], ["-3", "1"], ["abc", "1"]]) {
      await page.goto(SITE + "/programme/?page=" + q); await page.locator(".programme-card-title").first().waitFor();
      assert.equal(await status(), `Page ${want} of 2`, "clamp " + q);
    }

    // 7 → 3 pages; XSS-safe text.
    const ED = await adminLogin("CONTENT_EDITOR");
    const x = await ED.post("/api/admin/programme-items", {slug: "xss-" + run, displayOrder: 40, translations: {en: {title: `<img src=x onerror="window.__xss=1">Safe ${run}`, summary: "<script>window.__xss=2</script> summary", overview: "<b>bold?</b>", highlights: ["<i>x</i>"]}}});
    assert.equal(x.status, 201);
    await ED.post(`/api/admin/programme-items/${x.body.item.id}/action`, {action: "publish", reason: "xss check"});
    await page.goto(SITE + "/programme/"); await page.locator(".programme-card-title").first().waitFor();
    assert.equal(await status(), "Page 1 of 3");
    await page.goto(SITE + `/programme/xss-${run}/`); await page.locator(".programme-detail h1").waitFor();
    assert.match(await page.locator(".programme-detail h1").textContent(), /<img src=x/); assert.equal(await page.evaluate(() => window.__xss), undefined, "no script ran");

    // 0 → empty state.
    await publishOnly([]);
    await page.goto(SITE + "/programme/"); await page.getByText("Programme details coming soon").waitFor();

    // 404 for unknown and unpublished slugs (real status from the proxy / nginx).
    assert.equal((await page.goto(SITE + "/programme/does-not-exist/")).status(), 404);
    assert.equal((await page.goto(SITE + `/programme/${REG[0]}/`)).status(), 404, "unpublished → 404");
    await publishOnly([...REG, ...LEG]);

    // 中文 listing + detail.
    await page.goto(SITE + "/zh/programme/"); await page.locator(".programme-card-title").first().waitFor();
    assert.equal((await titles())[0], "矿业下游产业与绿色矿山大会"); assert.equal(await status(), "第 1 页，共 2 页");
    await page.locator(".programme-card-title").first().click(); await page.waitForURL(/\/zh\/programme\/mining-downstream-industry-green-mining\/$/);
    await page.locator(".programme-detail h1").waitFor();
    assert.equal(await page.locator(".programme-detail h1").textContent(), "矿业下游产业与绿色矿山大会");
    assert.equal(await page.getByText("返回全部活动").count(), 1);
    for (const t of ["Confirmed schedule", "See all published programmes"]) { await page.goto(SITE + "/zh/programme/"); assert.equal(await page.getByText(t).count(), 0); }

    // Viewports: no horizontal overflow, cards stack responsively.
    for (const vw of [360, 768, 1024, 1440]) {
      const p = await ctx.newPage(); await p.setViewportSize({width: vw, height: 900});
      for (const path of ["/programme/?page=2", `/programme/${REG[0]}/`, "/partners/"]) {
        await p.goto(SITE + path); await p.waitForLoadState("networkidle");
        assert.ok(await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, `no overflow ${vw}px ${path}`);
      }
      await p.close();
    }

    // Partners page: headings, organizers from CMS, media partners as logo cards, removed texts/sections.
    const sa = await adminLogin("SUPER_ADMIN");
    const mp = await sa.post("/api/admin/content", {kind: "PARTNER", locale: "en", slug: "media-" + run, title: "Media Partner " + run, imageUrl: "/assets/logos/aspindo-indonesian-mining-services-association.webp", altText: "Logo", rightsStatus: "OWNED", sortOrder: 0});
    await sa.patch("/api/admin/content/" + mp.body.item.id, {status: "PUBLISHED", reason: "e2e media partner"});
    await page.goto(SITE + "/partners/");
    await page.getByRole("heading", {name: "Organizer & Partners"}).waitFor();
    await page.getByRole("heading", {name: "Media Partners"}).waitFor();
    for (const gone of ["ORGANIZERS & INDUSTRY NETWORK", "Selected institutions and organizers mentioned", "Built around", "Confirmed organizers & partners", "Partner or sponsor IMDX 2027", "Sponsorship packages"])
      assert.equal(await page.getByText(gone).count(), 0, gone + " removed");
    const orgs = page.locator('[data-organizer-list]:not([data-kind]) .org-card__name');
    await page.waitForFunction(() => document.querySelectorAll("[data-organizer-list]:not([data-kind]) .org-card").length >= 5);
    assert.equal(await orgs.first().textContent(), "Shixin International Exhibition Group");
    await page.locator('[data-kind="PARTNER"] .org-card__name', {hasText: "Media Partner " + run}).waitFor();
    assert.equal(await page.locator('[data-kind="PARTNER"] .org-card img').first().isVisible(), true, "logo card like the organizer cards");
    await page.goto(SITE + "/zh/partners/");
    await page.getByRole("heading", {level: 2, name: /主办方与\s*合作伙伴/}).waitFor(); // the italic part is on its own line
    await page.getByRole("heading", {name: "媒体合作伙伴"}).waitFor();
    await page.getByText("世信国际会展集团").waitFor();

    // CMS round-trip: edit a published programme in Programme Pages → public page updates.
    const admin = await browser.newPage({viewport: {width: 1440, height: 1000}});
    const cookie = [...sa.jar].map(([k, v]) => ({name: k, value: v, url: SITE}));
    await admin.context().addCookies(cookie);
    await admin.goto(SITE + "/admin/programme-pages");
    await admin.getByRole("heading", {name: "Regular programmes"}).waitFor();
    await admin.getByRole("row", {name: /Indonesia Mining Industry Networking Reception/}).getByRole("button", {name: "Edit"}).click();
    await admin.getByLabel("Card summary (1–2 sentences)").fill("Meet the people behind Indonesia's mining industry. " + run);
    await admin.getByLabel("Change note (audit)").fill("e2e summary edit");
    await admin.getByRole("button", {name: "Save changes"}).click();
    await admin.getByText(/^Saved\./).waitFor();
    const d = await (await fetch(SITE + `/api/public/programmes/${REG[2]}?locale=en`)).json();
    assert.match(d.item.summary, new RegExp(run));
    await admin.close();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
