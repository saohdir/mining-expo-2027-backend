// Home "Exhibition insights & updates": CMS news cards (3 per page, pagination) and article detail pages (EN + 中文),
// edited in CMS → Website Content → News & updates. Plus the home clean-up (hero buttons, removed sections, nav item).
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {PrismaClient} from "@prisma/client";
import {adminLogin} from "./lib.mjs";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const SITE = process.env.E2E_SITE_URL;
const skip = !chromium ? "playwright not installed" : !SITE ? "E2E_FRONTEND_DIR not set" : false;
const db = new PrismaClient();
const run = Date.now().toString(36);
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
let hidden = [];
// Article written with the CMS block editor (stored as a block document).
const BLOCKS = JSON.stringify({format: "blocks", v: 1, blocks: [
  {t: "p", text: "Lead with **bold** and *italic* and a [link](/exhibit/). <script>alert(1)</script>"},
  {t: "h", level: 3, text: "Sub heading"},
  {t: "list", ordered: true, items: ["One", "Two"]},
  {t: "quote", text: "Mining moves forward.", cite: "Organizer"},
  {t: "image", url: "/assets/imd-logo-orange.webp", alt: "IMDX logo", caption: "Caption text"},
  {t: "divider"},
  {t: "button", text: "Register now", url: "/exhibit/"}]});
test.after(async () => {
  await db.contentItem.deleteMany({where: {kind: "NEWS", slug: {startsWith: "e2e-news-" + run}}});
  if (hidden.length) await db.contentItem.updateMany({where: {id: {in: hidden}}, data: {status: "PUBLISHED"}});
  await db.$disconnect();
});

test("news: CMS articles → 3 cards per page with pagination → article page; edit in CMS; Chinese version", {skip}, async () => {
  // Only this test's articles are published while it runs (other published news is restored afterwards).
  hidden = (await db.contentItem.findMany({where: {kind: "NEWS", status: "PUBLISHED"}, select: {id: true}})).map(i => i.id);
  await db.contentItem.updateMany({where: {id: {in: hidden}}, data: {status: "DRAFT"}});
  const ED = await adminLogin("CONTENT_EDITOR");
  const ids = [];
  for (let n = 1; n <= 4; n++) {
    const c = await ED.post("/api/admin/content", {kind: "NEWS", locale: "en", slug: `e2e-news-${run}-${n}`, title: `E2E article ${n} ${run}`, summary: `Summary ${n}`, role: "INDUSTRY FOCUS", sortOrder: n,
      body: n === 1 ? "Intro paragraph.\n\n## Highlights\n- First point\n- Second point\n\nClosing paragraph." : n === 2 ? BLOCKS : "Body " + n});
    ok(c, 201, "create " + n); ids.push(c.body.item.id);
    ok(await ED.patch("/api/admin/content/" + c.body.item.id, {status: "PUBLISHED", reason: "Publish e2e"}), 200, "publish " + n);
  }
  const zh = await ED.post("/api/admin/content", {kind: "NEWS", locale: "zh", slug: `e2e-news-${run}-1`, title: `中文文章 ${run}`, summary: "中文摘要", body: "中文正文。", sortOrder: 1}); ok(zh, 201, "zh");
  ok(await ED.patch("/api/admin/content/" + zh.body.item.id, {status: "PUBLISHED", reason: "Publish e2e"}), 200, "publish zh");
  // Editing an article (CMS edit form uses PATCH).
  ok(await ED.patch("/api/admin/content/" + ids[0], {title: `E2E article 1 edited ${run}`, reason: "Edit e2e"}), 200, "edit");
  ok(await (await adminLogin("VIEWER")).patch("/api/admin/content/" + ids[1], {title: "x", reason: "nope"}), 403, "viewer cannot edit");

  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({viewport: {width: 1280, height: 900}})).newPage();
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(SITE + "/");
    // Home clean-up.
    assert.equal((await page.locator('[data-cms-f="indonesia-mining-downstream.3"]').textContent()).trim(), "Join as Exhibitor ↗");
    assert.equal((await page.locator('[data-cms-f="indonesia-mining-downstream.4"]').textContent()).trim(), "Join as Visitor ↗");
    assert.equal(await page.locator("#visitor, #media").count(), 0, "'Your access' and 'industry in motion' removed");
    assert.equal(await page.locator('[data-cms-site="header"]').getByText("Networking Reception").count(), 0, "nav item removed");
    const news = page.locator("#news");
    await news.locator(".news-card").first().waitFor({timeout: 10000});
    assert.equal(await news.locator(".news-card").count(), 3, "3 cards on page 1");
    assert.match(await news.locator(".news-card h3").first().textContent(), /E2E article 1 edited/);
    await news.getByRole("button", {name: "Page 2"}).click();
    await news.getByText(`E2E article 4 ${run}`).waitFor();
    assert.equal(await news.locator(".news-card").count(), 1, "1 card on page 2");
    assert.equal(await news.getByRole("button", {name: "Next page"}).isDisabled(), true);
    await news.getByRole("button", {name: "Page 1"}).click();
    await news.getByRole("link", {name: new RegExp("E2E article 1 edited")}).click();
    await page.waitForURL(/\/news\/article\/\?slug=e2e-news-/);
    await page.locator(".news-article h1").waitFor();
    assert.match(await page.locator(".news-article h1").textContent(), /E2E article 1 edited/);
    assert.equal(await page.locator(".news-article-body h2").textContent(), "Highlights");
    assert.deepEqual(await page.locator(".news-article-body li").allTextContents(), ["First point", "Second point"]);
    assert.equal(await page.locator(".news-more-grid .news-card").count(), 3, "more updates");
    // Block article: every block type renders, text stays escaped.
    await page.goto(SITE + `/news/article/?slug=e2e-news-${run}-2`);
    const body = page.locator(".news-article-body"); await body.locator("h3").waitFor();
    assert.equal(await body.locator("p strong").first().textContent(), "bold");
    assert.equal(await body.locator("p em").first().textContent(), "italic");
    assert.equal(await body.locator('p a[href="/exhibit/"]').first().textContent(), "link");
    assert.equal(await body.locator("script").count(), 0); assert.match(await body.locator("p").first().textContent(), /<script>alert\(1\)<\/script>/);
    assert.equal(await body.locator("h3").textContent(), "Sub heading");
    assert.deepEqual(await body.locator("ol li").allTextContents(), ["One", "Two"]);
    assert.equal(await body.locator("blockquote cite").textContent(), "Organizer");
    assert.equal(await body.locator("figure img").getAttribute("alt"), "IMDX logo");
    assert.equal(await body.locator("figcaption").textContent(), "Caption text");
    assert.equal(await body.locator("hr").count(), 1);
    assert.match(await body.locator(".news-article-cta a").textContent(), /Register now/);
    await page.goto(SITE + `/zh/news/article/?slug=e2e-news-${run}-1`);
    await page.locator(".news-article h1").waitFor();
    assert.equal(await page.locator(".news-article h1").textContent(), `中文文章 ${run}`);
    await page.goto(SITE + `/zh/news/article/?slug=e2e-news-${run}-2`);
    await page.locator(".news-article h1").waitFor();
    assert.equal(await page.locator(".news-article h1").textContent(), `E2E article 2 ${run}`, "English fallback when no 中文 version");
    await page.goto(SITE + "/news/article/?slug=does-not-exist");
    await page.getByText("Article not found").waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
