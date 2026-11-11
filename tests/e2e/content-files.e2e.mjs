// Website Content fixes (Nov 2026): PDF upload for Downloads, block-editor article bodies, published content not cached.
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, BASE} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const cookie = c => [...c.jar].map(([k, v]) => k + "=" + v).join("; ");
const R = {};
test.after(async () => { await db.contentItem.deleteMany({where: {slug: {startsWith: "e2e-cf-" + run}}}); await db.$disconnect(); });
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const upload = async (c, bytes, name = "brochure.pdf", type = "application/pdf") => {
  const fd = new FormData(); fd.append("file", new Blob([bytes], {type}), name);
  const r = await fetch(`${BASE}/api/admin/files`, {method: "POST", body: fd, headers: {origin: BASE, cookie: cookie(c)}});
  return {status: r.status, body: await r.json()};
};

test("PDF upload for Downloads → publish → served inline as a sandboxed PDF", async () => {
  R.ED = await adminLogin("CONTENT_EDITOR"); R.SALES = await adminLogin("SALES");
  ok(await upload(R.SALES, pdf), 403, "sales cannot upload");
  const bad = await upload(R.ED, Buffer.from("not a pdf"), "fake.pdf"); ok(bad, 415, "non-PDF"); assert.equal(bad.body.error, "NOT_PDF"); assert.ok(bad.body.message);
  const up = await upload(R.ED, pdf); ok(up, 201, "upload");
  assert.match(up.body.url, /^\/api\/public\/media\/[0-9a-f-]{36}\.pdf$/); assert.equal(up.body.fileType, "PDF"); assert.equal(up.body.fileSizeBytes, pdf.length);
  const m = await fetch(BASE + up.body.url); assert.equal(m.status, 200);
  assert.equal(m.headers.get("content-type"), "application/pdf"); assert.match(m.headers.get("content-security-policy") || "", /sandbox/);
  assert.equal(Buffer.from(await m.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
  const d = await R.ED.post("/api/admin/content", {kind: "DOWNLOAD", title: "Brochure " + run, slug: "e2e-cf-" + run + "-dl", url: up.body.url, fileType: "PDF", fileSizeBytes: up.body.fileSizeBytes}); ok(d, 201, "download item");
  ok(await R.ED.patch("/api/admin/content/" + d.body.item.id, {status: "PUBLISHED", reason: "Publish e2e brochure"}), 200, "publish");
  assert.ok(await db.auditLog.findFirst({where: {action: "FILE_UPLOADED", resourceId: up.body.url.split("/").pop()}}));
});

test("article body: block documents are validated; public content is not cached", async () => {
  const doc = blocks => JSON.stringify({format: "blocks", v: 1, blocks});
  const slug = "e2e-cf-" + run + "-news";
  const good = await R.ED.post("/api/admin/content", {kind: "NEWS", title: "Blocks " + run, slug, summary: "S", body: doc([{t: "h", level: 2, text: "Hi"}, {t: "p", text: "Para"}, {t: "divider"}])}); ok(good, 201, "valid blocks");
  ok(await R.ED.post("/api/admin/content", {kind: "NEWS", title: "Bad", slug: slug + "-bad", body: doc([{t: "h", level: 5, text: "x"}])}), 400, "bad heading level");
  ok(await R.ED.post("/api/admin/content", {kind: "NEWS", title: "Bad", slug: slug + "-js", body: doc([{t: "button", text: "x", url: "javascript:alert(1)"}])}), 400, "unsafe url");
  ok(await R.ED.patch("/api/admin/content/" + good.body.item.id, {status: "PUBLISHED", reason: "Publish e2e blocks"}), 200, "publish");
  const r = await fetch(BASE + "/api/public/content?kind=NEWS");
  assert.equal(r.status, 200); assert.match(r.headers.get("cache-control") || "", /max-age=0/);
  const item = (await r.json()).items?.find(i => i.slug === slug);
  if (item) assert.ok(item.body.startsWith('{"format":"blocks"'));
});

test("delete replaces archive: removed from the website, audited, archive status no longer accepted", async () => {
  const slug = "e2e-cf-" + run + "-del";
  const c = await R.ED.post("/api/admin/content", {kind: "DOWNLOAD", title: "Delete me " + run, slug, url: "/downloads/x.pdf", fileType: "PDF"}); ok(c, 201, "create");
  const id = c.body.item.id;
  ok(await R.ED.patch("/api/admin/content/" + id, {status: "PUBLISHED", reason: "Publish e2e"}), 200, "publish");
  ok(await R.ED.patch("/api/admin/content/" + id, {status: "ARCHIVED", reason: "Archive e2e"}), 400, "archive removed");
  ok(await R.SALES.del("/api/admin/content/" + id, {}), 403, "sales cannot delete");
  ok(await R.ED.del("/api/admin/content/" + id, {reason: "E2E no longer needed"}), 200, "delete");
  assert.equal(await db.contentItem.count({where: {id}}), 0);
  const pub = await (await fetch(BASE + "/api/public/content?kind=DOWNLOAD")).json();
  assert.ok(!JSON.stringify(pub).includes(slug), "gone from the public API");
  const log = await db.auditLog.findFirst({where: {action: "CONTENT_DELETED", resourceId: id}});
  assert.equal(log.beforeState.slug, slug); assert.equal(log.afterState.reason, "E2E no longer needed");
  ok(await R.ED.del("/api/admin/content/" + id, {}), 404, "already deleted");
});
