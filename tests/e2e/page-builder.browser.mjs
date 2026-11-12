// Browser: the public static site applies the published CMS layout (order, hide, new blocks, SEO) and
// staff can preview a draft. Requires E2E_FRONTEND_DIR (static site) — e2e-local.sh starts a local proxy.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {adminLogin} from "./lib.mjs";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const SITE = process.env.E2E_SITE_URL;
const skip = !chromium ? "playwright not installed" : !SITE ? "E2E_FRONTEND_DIR not set" : false;

test("published layout reorders/hides designed sections, adds text-only blocks and SEO; draft preview for staff", {skip}, async () => {
  const ed = await adminLogin("CONTENT_EDITOR");
  const d = (await ed.get("/api/admin/pages/visitors")).body;
  const [a, b, c] = d.draft.blocks;
  const layout = {seo: {title: "Visit IMDX 2027 — CMS title", description: "CMS description"}, blocks: [
    {...c}, {id: "hello", type: "text", hidden: false, data: {eyebrow: "", heading: "Hello from CMS", body: "<script>window.pwned=1</script>Plain text only.\n\n- One\n- Two"}},
    {...a}, {...b, hidden: true}]};
  assert.equal((await ed.req("PUT", "/api/admin/pages/visitors", layout)).status, 200);
  const browser = await chromium.launch();
  try {
    const first = await browser.newPage({viewport: {width: 390, height: 844}});
    await first.goto(SITE + "/visitors/");
    await first.waitForTimeout(800);
    assert.equal(await first.getByText("Hello from CMS").count(), 0, "draft not shown publicly");
    assert.equal((await ed.post("/api/admin/pages/visitors/publish", {reason: "Browser layout test"})).status, 200);
    // The public layout endpoint is cacheable (≤60 s); a fresh browser profile sees the new version immediately.
    const page = await (await browser.newContext({viewport: {width: 390, height: 844}})).newPage();
    await page.goto(SITE + "/visitors/?v=2");
    await page.waitForFunction(() => document.documentElement.dataset.cmsLayout === "published", null, {timeout: 10000});
    assert.equal(await page.title(), "Visit IMDX 2027 — CMS title");
    const order = await page.$$eval("main > [data-cms-block]:not([data-cms-fixed]), main > [data-cms-custom]", els => els.filter(e => getComputedStyle(e).display !== "none").map(e => e.dataset.cmsBlock || e.dataset.cmsCustom));
    assert.deepEqual(order, [c.ref, "hello", a.ref], "order and hidden section applied");
    assert.equal(await page.evaluate(() => document.querySelector("main").firstElementChild?.dataset.cmsBlock), "page-hero", "page banner stays first");
    assert.equal(await page.evaluate(() => window.pwned), undefined, "CMS text is never executed as HTML");
    assert.equal(await page.locator("[data-cms-custom=hello] li").count(), 2, "bullets rendered");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, "no horizontal scroll");
    // Staff preview of a newer draft (needs CMS session on the same domain).
    assert.equal((await ed.req("PUT", "/api/admin/pages/visitors", {...layout, blocks: [{id: "draft-only", type: "cta", hidden: false, data: {heading: "Draft CTA", text: "", buttonLabel: "Go", buttonHref: "/account"}}, ...layout.blocks]})).status, 200);
    const ctx = await browser.newContext();
    await ctx.addCookies([...ed.jar].map(([name, value]) => ({name, value, url: SITE})));
    const staff = await ctx.newPage();
    await staff.goto(SITE + "/visitors/?cmsPreview=1");
    await staff.getByText("PREVIEW — unpublished draft").waitFor();
    await staff.getByText("Draft CTA").waitFor();
    const anon = await (await browser.newContext()).newPage();
    await anon.goto(SITE + "/visitors/?v=3"); await anon.waitForTimeout(800);
    assert.equal(await anon.getByText("Draft CTA").count(), 0, "draft stays private");
  } finally {
    await browser.close();
    await ed.post("/api/admin/pages/visitors/rollback", {version: 0, reason: "Restore design after browser test"});
  }
});

test("CMS editor: pick a page, reorder/hide blocks, add a block, save draft", {skip}, async () => {
  const ed = await adminLogin("CONTENT_EDITOR");
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({viewport: {width: 1280, height: 900}});
    await ctx.addCookies([...ed.jar].map(([name, value]) => ({name, value, url: SITE})));
    const page = await ctx.newPage();
    await page.goto(SITE + "/admin/pages");
    await page.getByRole("heading", {name: "Pages & layout"}).waitFor();
    // Named page buttons (every public page is listed, not only Home).
    const picker = page.getByRole("navigation", {name: "Choose a page to edit"});
    for (const name of ["Home", "About the Exhibition", "Exhibitors", "Visitor Information", "Header & footer (all pages)"]) await picker.getByRole("button", {name: new RegExp("^" + name.replace(/[&()]/g, "\\$&"))}).waitFor();
    await picker.getByRole("button", {name: /^Contact/}).click(); await page.waitForURL(/[?&]page=contact/);
    await page.getByRole("heading", {name: /Editing: Contact/}).waitFor();
    const items = page.locator("ol.page-blocks > li");
    const n = (await ed.get("/api/admin/pages/contact")).body.draft.blocks.length;
    await page.waitForFunction(c => document.querySelectorAll("ol.page-blocks > li").length === c && /Organizer|Contact|contact/i.test(document.querySelector("ol.page-blocks")?.textContent || ""), n);
    await page.getByRole("button", {name: /Move .* down/}).first().click();
    await items.first().getByRole("button", {name: "Hide"}).click();
    await page.getByLabel("Add block").selectOption("cta");
    await page.getByLabel("Heading").last().fill("Talk to our team");
    await page.getByLabel("Button label").fill("Contact us");
    await page.getByLabel("Button link").fill("/contact/");
    await page.getByRole("button", {name: "Save draft"}).click();
    await page.getByText("Draft saved.").waitFor();
    const draft = (await ed.get("/api/admin/pages/contact")).body.draft;
    assert.equal(draft.blocks.length, n + 1); assert.equal(draft.blocks.at(-1).data.buttonHref, "/contact/");
    assert.ok(draft.blocks.some(b => b.hidden), "hidden flag saved");
    // Photo fields: upload replaces the designed image (Exhibitors intro photo).
    await page.goto(SITE + "/admin/pages?page=exhibitors"); await page.getByRole("heading", {name: /Editing: Exhibitors/}).waitFor();
    await page.locator("ol.page-blocks > li").first().getByRole("button", {name: /Edit content/}).click();
    const sharp = (await import("sharp")).default; const png = await sharp({create: {width: 40, height: 30, channels: 3, background: "#c33"}}).png().toBuffer();
    const photo = page.locator(".cms-field-image").first();
    await photo.locator('input[type=file]').setInputFiles({name: "year.png", mimeType: "image/png", buffer: png});
    await photo.getByText("· replaced").waitFor();
    assert.match(await photo.locator("img").getAttribute("src"), /^\/api\/public\/media\/.+\.webp$/);
  } finally { await browser.close(); }
});

test("CR-LANG-01 language switch: zh layout served under /zh/, EN fallback, preference remembered", {skip}, async () => {
  const ed = await adminLogin("CONTENT_EDITOR");
  const d = (await ed.get("/api/admin/pages/the-venue?locale=zh")).body;
  const layout = {seo: {title: "展馆 | IMDX 2027", description: "展馆信息"}, blocks: [{id: "hello", type: "text", hidden: false, data: {eyebrow: "", heading: "欢迎来到JIEXPO", body: "中文展馆信息。"}}, ...d.draft.blocks]};
  assert.equal((await ed.req("PUT", "/api/admin/pages/the-venue?locale=zh", layout)).status, 200);
  assert.equal((await ed.post("/api/admin/pages/the-venue/publish?locale=zh", {reason: "Chinese venue copy"})).status, 200);
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(SITE + "/the-venue/");
    await page.waitForTimeout(800);
    assert.equal(await page.getByText("欢迎来到JIEXPO").count(), 0, "English by default");
    await page.locator('.lang-switch button[lang="zh-Hans"]').click();
    await page.waitForURL(u => u.pathname === "/zh/the-venue/");
    await page.waitForFunction(() => document.documentElement.dataset.cmsLayout === "published");
    await page.getByText("欢迎来到JIEXPO").waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.lang), "zh-Hans");
    assert.equal(await page.title(), "展馆 | IMDX 2027");
    await page.goto(SITE + "/about/");
    assert.equal(await page.evaluate(() => document.documentElement.lang), "zh-Hans", "preference remembered across pages");
    await page.locator('.lang-switch button[lang="en"]').click();
    await page.waitForURL(u => !u.pathname.startsWith("/zh"));
    await page.goto(SITE + "/the-venue/"); await page.waitForTimeout(800);
    assert.equal(await page.getByText("欢迎来到JIEXPO").count(), 0, "back to English");
  } finally {
    await browser.close();
    await ed.post("/api/admin/pages/the-venue/rollback?locale=zh", {version: 0, reason: "Restore after language test"});
  }
});
