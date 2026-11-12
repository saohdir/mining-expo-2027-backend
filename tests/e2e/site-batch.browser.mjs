// Owner batch (10 Nov 2026): navbar changes, sign-in popup (+ /account as popup, no "Admin CMS" link), home conference cards with
// pagination, news "Read article", contact form and "Latest news" removed, Event Highlight gallery (years, 12 per page, lightbox, 中文).
import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup, TEST_PASSWORD, BASE} from "./lib.mjs";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const SITE = process.env.E2E_SITE_URL;
const skip = !chromium ? "playwright not installed" : !SITE ? "E2E_FRONTEND_DIR not set" : false;
const db = new PrismaClient();
const run = Date.now().toString(36);
const Y = 2093;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "site-batch-"));
test.after(async () => {
  await db.galleryItem.deleteMany({where: {year: Y}}); await db.galleryYear.deleteMany({where: {year: Y}});
  fs.rmSync(dir, {recursive: true, force: true}); await db.$disconnect();
});

test("navbar, sign-in popup, home cards, removed sections, Event Highlight gallery", {skip}, async () => {
  execFileSync("npx", ["tsx", "scripts/seed-programmes.ts", "--confirm", "--approve-legacy"], {stdio: "pipe", env: process.env});
  execFileSync("npx", ["tsx", "scripts/seed-news-articles.ts", "--confirm"], {stdio: "pipe", env: process.env});
  const email = `batch-${run}@test.local`; await customerSignup(email, "Batch Tester");
  // Gallery content: 13 published photos in one year → 2 pages.
  const ED = await adminLogin("CONTENT_EDITOR"), cookie = [...ED.jar].map(([k, v]) => k + "=" + v).join("; ");
  assert.equal((await ED.post("/api/admin/gallery/years", {year: Y, label: "IMDX " + Y})).status, 201);
  const img = path.join(dir, "p.jpg"); execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=900x600:duration=1", "-frames:v", "1", img]);
  for (let i = 0; i < 13; i++) {
    const r = await fetch(BASE + "/api/admin/gallery/upload?" + new URLSearchParams({year: String(Y), name: "p.jpg", rightsStatus: "OWNED", alt: "Hall " + i}), {method: "POST", headers: {cookie, origin: BASE, "content-type": "image/jpeg"}, body: fs.readFileSync(img)});
    const {item} = await r.json(); assert.equal((await ED.patch("/api/admin/gallery/" + item.id, {status: "PUBLISHED", titleEn: "Hall " + i, titleZh: "展馆 " + i})).status, 200);
  }
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({viewport: {width: 1440, height: 900}})).newPage();
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(SITE + "/");
    const nav = await page.locator('[data-cms-site="header"]').textContent();
    for (const gone of ["Exhibition Scope", "Networking Reception", "Photo & Motion Highlights"]) assert.ok(!nav.includes(gone), gone + " removed from navbar");
    for (const want of ["Event Highlight", "Conferences"]) assert.ok(nav.includes(want), want + " in navbar");
    assert.ok(!/Programme\s*⌄/.test(nav), "Programme renamed to Conferences");
    assert.equal(await page.locator('[data-cms-f="site-header.9"]').getAttribute("href"), "/floorplan", "Booth Reservation → floorplan");
    assert.equal((await page.locator('[data-cms-f="indonesia-mining-downstream.3"]').textContent()).trim(), "Join as Exhibitor ↗");
    // Home conferences: programme cards with pagination (?conf=), cards open detail pages.
    const conf = page.locator("#conference");
    await conf.locator(".programme-card-title").first().waitFor();
    assert.equal(await conf.locator(".programme-pager-status").textContent(), "Page 1 of 2");
    await conf.getByRole("button", {name: "Page 2"}).click(); await page.waitForURL(/\?conf=2$/);
    await conf.locator(".programme-card-title").first().click(); await page.waitForURL(/\/programme\/[a-z0-9-]+\/$/);
    // Home news: carousel cards link to the article (title link on the centre card).
    await page.goto(SITE + "/"); await page.locator("#news .nc-slide.is-active").waitFor();
    assert.equal(await page.locator('#news .nc-slide.is-active h3 a[href*="/news/article/?slug="]').count(), 1); assert.equal(await page.getByText("Explore the exhibit scope").count(), 0);
    // "Visitor Registration" removed from the navbar (owner request), on the static site and the app pages.
    assert.equal(await page.locator('[data-cms-site="header"]').getByText("Visitor Registration").count(), 0);
    await page.goto(SITE + "/floorplan"); await page.locator(".imdx-site-header").first().waitFor();
    assert.equal(await page.locator(".imdx-site-header").getByText("Visitor Registration", {exact: true}).count(), 0);
    // Sign-in popup: open, Esc from inside the form closes it, sign in → account.
    await page.goto(SITE + "/");
    await page.locator('[data-cms-f="site-header.22"]').click(); await page.locator(".auth-popup.is-ready").waitFor();
    const form = page.frameLocator(".auth-popup iframe");
    assert.equal(await form.locator(".imdx-site-header").count(), 0, "no site chrome inside the popup");
    await form.getByLabel("Email address").click(); await page.keyboard.press("Escape");
    await page.locator(".auth-popup").waitFor({state: "detached"});
    await page.locator('[data-cms-f="site-header.22"]').click(); await page.locator(".auth-popup.is-ready").waitFor();
    await form.getByLabel("Email address").fill(email); await form.getByLabel("Password", {exact: true}).fill(TEST_PASSWORD);
    await form.getByRole("button", {name: "Sign in"}).click();
    await page.waitForURL(/\/account$/); await page.getByRole("tab", {name: "Home"}).waitFor();
    assert.equal(await page.getByText("Admin CMS").count(), 0, "no Admin CMS link");
    // /account signed out shows the form as a popup dialog.
    const anon = await (await browser.newContext({viewport: {width: 1280, height: 900}})).newPage();
    await anon.goto(SITE + "/account"); await anon.locator('.auth-modal[role="dialog"]').waitFor(); assert.equal(await anon.getByText("Admin CMS").count(), 0);
    // Removed sections.
    await page.goto(SITE + "/contact/"); assert.equal(await page.locator("#imdx-contact-form").count(), 0);
    await page.goto(SITE + "/news/"); await page.locator(".news-card").first().waitFor(); assert.equal(await page.getByText("Latest news").count(), 0);
    // Event Highlight gallery.
    await page.goto(SITE + `/highlights/?year=${Y}`);
    await page.locator(".gallery-tile").first().waitFor();
    assert.equal(await page.locator("h1").first().textContent(), "Event Highlight");
    assert.equal(await page.locator('.gallery-years [aria-selected="true"]').textContent(), `IMDX ${Y}13`);
    assert.equal(await page.locator(".gallery-tile").count(), 12); assert.equal(await page.locator(".gallery-status").textContent(), "Page 1 of 2");
    await page.getByRole("button", {name: "Page 2"}).click(); await page.waitForURL(/[?&]page=2$/); // the newest year is the default, so ?year= is omitted
    assert.equal(await page.locator(".gallery-tile").count(), 1);
    await page.locator(".gallery-tile").first().click(); await page.locator(".gallery-lightbox img").waitFor();
    await page.keyboard.press("Escape"); assert.equal(await page.locator(".gallery-lightbox").count(), 0);
    await page.goBack(); await page.waitForFunction(() => document.querySelector(".gallery-status")?.textContent === "Page 1 of 2");
    await page.goto(SITE + `/zh/highlights/?year=${Y}`); await page.locator(".gallery-tile").first().waitFor();
    assert.equal(await page.locator("h1").first().textContent(), "精彩回顾"); assert.match(await page.locator(".gallery-cap").first().textContent(), /^展馆/);
    const mobile = await (await browser.newContext({viewport: {width: 390, height: 844}})).newPage();
    await mobile.goto(SITE + `/highlights/?year=${Y}`); await mobile.locator(".gallery-tile").first().waitFor();
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, "no horizontal scroll on mobile");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
