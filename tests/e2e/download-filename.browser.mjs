// Owner prompt 04: a file from Exhibitors › Exhibitor downloads is saved under its CMS title + real extension,
// not the storage key; a CMS rename applies to the next download; the file bytes are unchanged.
import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
import {PrismaClient} from "@prisma/client";
import {adminLogin, BASE} from "./lib.mjs";
let chromium = null;
try { ({chromium} = createRequire(import.meta.url)("playwright")); } catch { /* skipped */ }
const SITE = process.env.E2E_SITE_URL;
const skip = !chromium ? "playwright not installed" : !SITE ? "E2E_FRONTEND_DIR not set" : false;
const db = new PrismaClient();
const run = Date.now().toString(36);
const cookie = c => [...c.jar].map(([k, v]) => k + "=" + v).join("; ");
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
let hidden = [];
test.after(async () => {
  await db.contentItem.deleteMany({where: {slug: {startsWith: "e2e-dlname-" + run}}});
  if (hidden.length) await db.contentItem.updateMany({where: {id: {in: hidden}}, data: {status: "PUBLISHED"}});
  await db.$disconnect();
});
const TITLE = "Indonesia Clean Coal and Green Mining Conference 2027 Indonesia Coal and Energy Expo (ICEE) 2027 Invitation letter in English";

test("exhibitor downloads are saved under the CMS title with the real extension", {skip}, async () => {
  hidden = (await db.contentItem.findMany({where: {kind: "DOWNLOAD", status: "PUBLISHED"}, select: {id: true}})).map(i => i.id);
  await db.contentItem.updateMany({where: {id: {in: hidden}}, data: {status: "DRAFT"}});
  const ED = await adminLogin("CONTENT_EDITOR");
  const fd = new FormData(); fd.append("file", new Blob([pdf], {type: "application/pdf"}), "scan_0042_final.pdf");
  const up = await (await fetch(`${BASE}/api/admin/files`, {method: "POST", body: fd, headers: {origin: BASE, cookie: cookie(ED)}})).json();
  const c = await ED.post("/api/admin/content", {kind: "DOWNLOAD", title: TITLE, slug: `e2e-dlname-${run}`, url: up.url, fileType: "PDF", fileSizeBytes: pdf.length});
  assert.equal(c.status, 201);
  assert.equal((await ED.patch("/api/admin/content/" + c.body.item.id, {status: "PUBLISHED", reason: "E2E download filename"})).status, 200);

  // Server: attachment with the exact UTF-8 title; plain media URL stays inline (viewer links keep working).
  const h = await fetch(BASE + up.url + "?download=1");
  assert.equal(h.headers.get("content-type"), "application/pdf");
  const cd = h.headers.get("content-disposition"); assert.match(cd, /^attachment;/);
  assert.equal(decodeURIComponent(cd.split("filename*=UTF-8''")[1]), TITLE + ".pdf");
  assert.deepEqual(Buffer.from(await h.arrayBuffer()), pdf, "file bytes unchanged");
  assert.equal((await fetch(BASE + up.url)).headers.get("content-disposition"), "inline");
  // The name never comes from the request.
  const forged = await fetch(BASE + up.url + "?download=1&name=evil.exe");
  assert.equal(decodeURIComponent(forged.headers.get("content-disposition").split("''")[1]), TITLE + ".pdf");

  // A UTF-8 locale like any real desktop/phone; without it Chromium on Linux replaces non-ASCII names with "download".
  const browser = await chromium.launch({env: {...process.env, LANG: "C.UTF-8", LC_ALL: "C.UTF-8"}});
  try {
    const page = await (await browser.newContext({acceptDownloads: true})).newPage();
    await page.goto(SITE + "/exhibitors/");
    const btn = page.locator("[data-xb-downloads] a.xb-btn-o").first(); await btn.waitFor();
    assert.equal(await btn.getAttribute("href"), up.url + "?download=1");
    const [dl] = await Promise.all([page.waitForEvent("download"), btn.click()]);
    assert.equal(dl.suggestedFilename(), TITLE + ".pdf", "browser saves the CMS title");
    assert.deepEqual(fs.readFileSync(await dl.path()), pdf);

    // Rename in the CMS → the next download uses the new name; the stored file and link stay the same.
    const renamed = "参展邀请函 (中文) 2027";
    assert.equal((await ED.patch("/api/admin/content/" + c.body.item.id, {title: renamed, reason: "E2E rename"})).status, 200);
    const item = await db.contentItem.findUnique({where: {id: c.body.item.id}});
    if (item.status !== "PUBLISHED") assert.equal((await ED.patch("/api/admin/content/" + c.body.item.id, {status: "PUBLISHED", reason: "E2E republish"})).status, 200);
    await page.reload(); await btn.waitFor();
    const [dl2] = await Promise.all([page.waitForEvent("download"), btn.click()]);
    assert.equal(dl2.suggestedFilename(), renamed + ".pdf", "Unicode title after a CMS rename");
  } finally { await browser.close(); }
});
