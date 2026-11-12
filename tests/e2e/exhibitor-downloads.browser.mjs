// Exhibitors › Exhibitor Downloads: shows only the files published in CMS › Website content › Downloads (one card each);
// the section is hidden while there is none.
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
let hidden = [];
test.after(async () => {
  await db.contentItem.deleteMany({where: {slug: {startsWith: "e2e-xdl-" + run}}});
  if (hidden.length) await db.contentItem.updateMany({where: {id: {in: hidden}}, data: {status: "PUBLISHED"}});
  await db.$disconnect();
});

test("exhibitor downloads: hidden without files, one card per published CMS download", {skip}, async () => {
  hidden = (await db.contentItem.findMany({where: {kind: "DOWNLOAD", status: "PUBLISHED"}, select: {id: true}})).map(i => i.id);
  await db.contentItem.updateMany({where: {id: {in: hidden}}, data: {status: "DRAFT"}});
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(SITE + "/exhibitors/"); await page.waitForTimeout(1000);
    const sec = page.locator('[data-cms-block="exhibitor-downloads"]');
    assert.equal(await sec.isVisible(), false, "no published files → section hidden");
    assert.equal(await page.getByText("Coming soon").count(), 0); assert.equal(await page.locator("[data-xb-downloads] li").count(), 0);
    const ED = await adminLogin("CONTENT_EDITOR");
    for (const [n, title] of [[1, "IMDX 2027 Exhibition Brochure"], [2, "Exhibitor Manual"]]) {
      const c = await ED.post("/api/admin/content", {kind: "DOWNLOAD", title, slug: `e2e-xdl-${run}-${n}`, summary: "Uploaded in the CMS", url: `/downloads/e2e-${n}.pdf`, fileType: "PDF", fileSizeBytes: 2 * 1048576, sortOrder: n});
      assert.equal(c.status, 201);
      assert.equal((await ED.patch("/api/admin/content/" + c.body.item.id, {status: "PUBLISHED", reason: "E2E download"})).status, 200);
    }
    await page.reload(); await page.locator("[data-xb-downloads] li").first().waitFor();
    assert.equal(await sec.isVisible(), true);
    const cards = page.locator("[data-xb-downloads] li"); assert.equal(await cards.count(), 2, "exactly the published files");
    assert.deepEqual(await cards.locator("h3").allTextContents(), ["IMDX 2027 Exhibition Brochure", "Exhibitor Manual"]);
    const a = cards.first().locator("a.xb-btn-o");
    assert.equal(await a.getAttribute("href"), "/downloads/e2e-1.pdf"); assert.equal((await a.textContent()).trim(), "Download PDF");
    assert.match(await cards.first().locator(".xb-dl-meta").textContent(), /PDF · 2\.0 MB/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
