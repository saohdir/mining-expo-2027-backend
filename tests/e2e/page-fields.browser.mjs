// Browser: published field overrides change designed-section text, header nav and footer on the static site; script text stays inert.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {adminLogin} from "./lib.mjs";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const SITE = process.env.E2E_SITE_URL;
const skip = !chromium ? "playwright not installed" : !SITE ? "E2E_FRONTEND_DIR not set" : false;

test("designed text, rich heading, nav link and footer are editable from the CMS", {skip}, async () => {
  const ed = await adminLogin("SUPER_ADMIN");
  const home = (await ed.get("/api/admin/pages/home")).body, site = (await ed.get("/api/admin/pages/site")).body;
  const hero = home.fields["indonesia-mining-downstream"], p = hero.find(f => f.tag === "p" && f.mode === "plain"), h1 = hero.find(f => f.tag === "h1");
  const nav = site.fields["site-header"].find(f => f.tag === "a" && f.text === "Contact"), foot = site.fields["site-footer"].find(f => f.kind === "text");
  assert.equal((await ed.req("PUT", "/api/admin/pages/home", {seo: home.draft.seo, blocks: home.draft.blocks, fields: {[p.key]: {text: "<img src=x onerror=window.pwned=1>Browser edited intro", mode: "plain"}, [h1.key]: {text: "Edited title\n*Second line*", mode: "rich"}}})).status, 200);
  assert.equal((await ed.post("/api/admin/pages/home/publish", {reason: "Browser field test"})).status, 200);
  assert.equal((await ed.req("PUT", "/api/admin/pages/site", {seo: {title: "", description: ""}, blocks: [], fields: {[nav.key]: {text: "Hubungi Kami", href: "/contact/"}, [foot.key]: {text: "Footer from CMS"}}})).status, 200);
  assert.equal((await ed.post("/api/admin/pages/site/publish", {reason: "Browser field test"})).status, 200);
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({viewport: {width: 1280, height: 900}})).newPage();
    await page.goto(SITE + "/?f=1");
    await page.waitForFunction(() => document.documentElement.dataset.cmsLayout === "published", null, {timeout: 10000});
    await page.waitForFunction(k => document.querySelector(`[data-cms-f="${k}"]`)?.textContent === "Hubungi Kami", nav.key, {timeout: 10000});
    assert.equal(await page.locator(`[data-cms-f="${p.key}"]`).textContent(), "<img src=x onerror=window.pwned=1>Browser edited intro");
    assert.equal(await page.evaluate(() => window.pwned), undefined, "no HTML injection");
    assert.equal(await page.locator(`[data-cms-f="${h1.key}"] em`).textContent(), "Second line");
    assert.equal(await page.locator(`[data-cms-f="${h1.key}"] br`).count(), 1);
    assert.equal(await page.locator(`[data-cms-f="${nav.key}"]`).getAttribute("href"), "/contact/");
    assert.equal(await page.locator(`[data-cms-f="${foot.key}"]`).first().textContent().then(t => t.includes("Footer from CMS")), true);
    const other = await (await browser.newContext()).newPage();
    await other.goto(SITE + "/about/?f=1");
    await other.waitForFunction(k => document.querySelector(`[data-cms-f="${k}"]`)?.textContent === "Hubungi Kami", nav.key, {timeout: 10000});
  } finally {
    await browser.close();
    await ed.post("/api/admin/pages/home/rollback", {version: 0, reason: "Restore design after browser test"});
    await ed.post("/api/admin/pages/site/rollback", {version: 0, reason: "Restore design after browser test"});
  }
});
