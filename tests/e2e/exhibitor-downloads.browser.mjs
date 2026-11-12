// Exhibitors › Exhibitor Downloads: the designed Brochure / Invitation cards link to the PDF published in
// CMS › Website content › Downloads (matched by "brochure" / "invitation" in the title or slug); otherwise "Coming soon".
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

test("exhibitor download cards: Coming soon without a PDF, Download PDF once the brochure is published", {skip}, async () => {
  hidden = (await db.contentItem.findMany({where: {kind: "DOWNLOAD", status: "PUBLISHED"}, select: {id: true}})).map(i => i.id);
  await db.contentItem.updateMany({where: {id: {in: hidden}}, data: {status: "DRAFT"}});
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage(); const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(SITE + "/exhibitors/");
    const brochure = page.locator('a[data-download-match="brochure"]'), invite = page.locator('a[data-download-match="invitation"]');
    await page.waitForTimeout(800);
    assert.equal((await brochure.textContent()).trim(), "Coming soon"); assert.equal(await brochure.getAttribute("href"), null);
    const ED = await adminLogin("CONTENT_EDITOR");
    const c = await ED.post("/api/admin/content", {kind: "DOWNLOAD", title: "IMDX 2027 Exhibition Brochure", slug: "e2e-xdl-" + run, url: "/downloads/e2e-brochure.pdf", fileType: "PDF"});
    assert.equal(c.status, 201);
    assert.equal((await ED.patch("/api/admin/content/" + c.body.item.id, {status: "PUBLISHED", reason: "E2E brochure"})).status, 200);
    await page.reload(); await page.waitForFunction(() => document.querySelector('a[data-download-match="brochure"]')?.getAttribute("href"));
    assert.equal(await brochure.getAttribute("href"), "/downloads/e2e-brochure.pdf");
    assert.equal((await brochure.textContent()).trim(), "Download PDF"); assert.equal(await brochure.getAttribute("aria-disabled"), null);
    assert.equal((await invite.textContent()).trim(), "Coming soon", "the invitation card stays empty");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
