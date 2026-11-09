// Event Highlight gallery: years, photo upload (compressed now), video upload (compressed by the worker with ffmpeg), publish rules,
// public API (year buttons, 12 per page, drafts hidden), media access (drafts staff-only, byte ranges), RBAC, delete.
import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {PrismaClient} from "@prisma/client";
import {adminLogin, BASE} from "./lib.mjs";

const db = new PrismaClient();
const Y = 2091, Y2 = 2092; // far-future test years, removed afterwards
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-e2e-"));
let hasFfmpeg = true; try { execFileSync("ffmpeg", ["-version"], {stdio: "ignore"}); } catch { hasFfmpeg = false; }
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const cookieOf = c => [...c.jar].map(([k, v]) => k + "=" + v).join("; ");
async function upload(c, file, type, extra = {}) {
  const r = await fetch(BASE + "/api/admin/gallery/upload?" + new URLSearchParams({year: String(Y), name: path.basename(file), ...extra}),
    {method: "POST", headers: {cookie: cookieOf(c), origin: BASE, "content-type": type}, body: fs.readFileSync(file)});
  return {status: r.status, body: await r.json().catch(() => ({}))};
}
test.after(async () => {
  const items = await db.galleryItem.findMany({where: {year: {in: [Y, Y2]}}});
  await db.galleryItem.deleteMany({where: {year: {in: [Y, Y2]}}}); await db.galleryYear.deleteMany({where: {year: {in: [Y, Y2]}}});
  fs.rmSync(dir, {recursive: true, force: true}); await db.$disconnect(); void items;
});

test("gallery: years, compressed uploads, publish rules, public pages per year, media access", async () => {
  const [ED, VIEW] = await Promise.all([adminLogin("CONTENT_EDITOR"), adminLogin("VIEWER")]);
  ok(await VIEW.post("/api/admin/gallery/years", {year: Y}), 403, "viewer cannot add years");
  ok(await ED.post("/api/admin/gallery/years", {year: Y, label: "IMDX " + Y}), 201, "add year");
  ok(await ED.post("/api/admin/gallery/years", {year: Y}), 409, "duplicate year");
  ok(await ED.post("/api/admin/gallery/years", {year: Y2}), 201, "second year");

  // A large photo is re-encoded to WebP ≤ 2000 px.
  const big = path.join(dir, "big.png");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=3200x2400:duration=1", "-frames:v", "1", big]);
  const p = await upload(ED, big, "image/png", {rightsStatus: "OWNED"}); ok(p, 201, "photo upload");
  assert.equal(p.body.item.kind, "PHOTO"); assert.equal(p.body.item.processing, "READY");
  assert.ok(Math.max(p.body.item.width, p.body.item.height) <= 2000, "resized"); assert.ok(p.body.item.bytes < p.body.item.originalBytes, "smaller than original");
  // Wrong content for the declared type is refused; viewer cannot upload.
  const fake = path.join(dir, "fake.jpg"); fs.writeFileSync(fake, "not an image at all");
  ok(await upload(ED, fake, "image/jpeg"), 415, "content sniffing");
  ok(await upload(VIEW, big, "image/png"), 403, "viewer cannot upload");
  ok(await upload(ED, big, "application/pdf"), 415, "type allow-list");

  // Draft media is staff-only; publishing needs alt text + approved rights.
  const photo = p.body.item;
  assert.equal((await fetch(BASE + "/api/public/gallery-media/" + photo.fileKey)).status, 404, "draft file hidden");
  assert.equal((await fetch(BASE + "/api/public/gallery-media/" + photo.fileKey, {headers: {cookie: cookieOf(ED)}})).status, 200, "staff preview");
  ok(await ED.patch("/api/admin/gallery/" + photo.id, {status: "PUBLISHED"}), 409, "alt text required");
  ok(await ED.patch("/api/admin/gallery/" + photo.id, {altEn: "Exhibition hall", altZh: "展馆", titleEn: "Opening day", titleZh: "开幕日", status: "PUBLISHED"}), 200, "publish photo");
  assert.equal((await fetch(BASE + "/api/public/gallery-media/" + photo.thumbKey)).status, 200, "published thumbnail public");

  // Video: compressed in the background by the worker (H.264 MP4 + poster), then published; byte ranges for seeking.
  if (hasFfmpeg) {
    const vid = path.join(dir, "clip.mov");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=4", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "mpeg4", "-q:v", "2", "-c:a", "aac", "-shortest", vid]);
    const v = await upload(ED, vid, "video/quicktime", {rightsStatus: "ORGANIZER_PROVIDED", alt: "Booth tour"}); ok(v, 201, "video upload");
    assert.equal(v.body.item.processing, "PENDING");
    let item; for (let i = 0; i < 90; i++) { item = await db.galleryItem.findUniqueOrThrow({where: {id: v.body.item.id}}); if (["READY", "FAILED"].includes(item.processing)) break; await new Promise(r => setTimeout(r, 1000)); }
    assert.equal(item.processing, "READY", "worker compressed the video: " + item.processingError);
    assert.ok(item.fileKey.endsWith(".mp4") && item.thumbKey.endsWith(".webp") && item.bytes < item.originalBytes && item.width <= 1280 && Math.round(item.durationSec) === 4, JSON.stringify(item));
    assert.equal(item.originalKey, null, "original removed");
    ok(await ED.patch("/api/admin/gallery/" + item.id, {status: "PUBLISHED"}), 200, "publish video");
    const range = await fetch(BASE + "/api/public/gallery-media/" + item.fileKey, {headers: {range: "bytes=0-99"}});
    assert.equal(range.status, 206); assert.equal(range.headers.get("content-type"), "video/mp4"); assert.equal((await range.arrayBuffer()).byteLength, 100);
  }

  // 13 photos in total → 2 public pages of 12; year buttons only for years with published items; 中文 texts.
  const small = path.join(dir, "small.jpg");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=size=800x600:duration=1", "-frames:v", "1", small]);
  for (let i = 0; i < 12; i++) { const r = await upload(ED, small, "image/jpeg", {rightsStatus: "OWNED", alt: "Photo " + i}); ok(r, 201, "photo " + i);
    ok(await ED.patch("/api/admin/gallery/" + r.body.item.id, {status: "PUBLISHED"}), 200, "publish " + i); }
  const g = async (q) => (await fetch(BASE + "/api/public/gallery?" + new URLSearchParams(q))).json();
  let d = await g({year: String(Y)});
  const total = 13 + (hasFfmpeg ? 1 : 0);
  assert.equal(d.year, Y); assert.equal(d.total, total); assert.equal(d.items.length, 12); assert.equal(d.pages, 2);
  assert.ok(d.years.some(y => y.year === Y && y.label === "IMDX " + Y)); assert.ok(!d.years.some(y => y.year === Y2), "empty year has no button");
  assert.equal((await g({year: String(Y), page: "99"})).page, 2, "clamped");
  assert.equal((await g({year: String(Y), locale: "zh"})).items[0].title, "开幕日");
  // Hide a year → gone from the site, files no longer public.
  ok(await ED.patch(`/api/admin/gallery/years/${Y}`, {published: false}), 200, "hide year");
  assert.ok(!(await g({})).years.some(y => y.year === Y)); assert.equal((await fetch(BASE + "/api/public/gallery-media/" + photo.fileKey)).status, 404);
  ok(await ED.patch(`/api/admin/gallery/years/${Y}`, {published: true}), 200, "show year");
  // Move to another year, delete, cannot delete a non-empty year.
  ok(await ED.patch("/api/admin/gallery/" + photo.id, {year: Y2}), 200, "move year");
  d = await g({year: String(Y2)}); assert.equal(d.items[0].id, photo.id);
  ok(await ED.del(`/api/admin/gallery/years/${Y2}`), 409, "non-empty year");
  ok(await ED.del("/api/admin/gallery/" + photo.id), 200, "delete item");
  assert.equal((await fetch(BASE + "/api/public/gallery-media/" + photo.fileKey)).status, 404, "file removed");
  ok(await ED.del(`/api/admin/gallery/years/${Y2}`), 200, "delete empty year");
  assert.ok(await db.auditLog.findFirst({where: {action: "GALLERY_UPLOADED"}}));
});
