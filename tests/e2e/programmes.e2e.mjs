// CR-PROGRAMME API: seed (idempotent), public list order + detail + 404, nginx existence check, CMS RBAC, editorial approval,
// confirmed-facts rule, conference link safety (no bookings), reorder within groups, preview, unpublish/delete/restore, rollback.
import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {PrismaClient} from "@prisma/client";
import {adminLogin, BASE} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const pub = async (path) => { const r = await fetch(BASE + path); return {status: r.status, body: r.status === 204 ? null : await r.json().catch(() => null)}; };
const exists = async (uri, cookie = "") => (await fetch(BASE + "/api/public/programme-exists", {headers: {"x-original-uri": uri, cookie}})).status;
const REG = ["mining-downstream-industry-green-mining", "china-indonesia-coal-energy-conference", "indonesia-mining-industry-networking-reception"];
const LEG = ["indonesia-china-coal-energy-conference-reference", "indonesia-clean-coal-green-mining-conference", "indonesia-coal-underground-mining-downstream-processing"];
const S = {};
const item = (slug, extra = {}) => ({slug, translations: {en: {title: "E2E programme " + slug, summary: "A short summary for testing.", overview: "Overview paragraph.", highlights: ["One", "Two"]}}, ...extra});
test.after(async () => {
  const mine = await db.programmeItem.findMany({where: {slug: {contains: run}}, select: {id: true}});
  const ids = mine.map(m => m.id);
  await db.programmeRevision.deleteMany({where: {itemId: {in: ids}}}); await db.programmeTranslation.deleteMany({where: {itemId: {in: ids}}}); await db.programmeItem.deleteMany({where: {id: {in: ids}}});
  await db.programmeItem.updateMany({where: {slug: {in: LEG}}, data: {status: "DRAFT", editorialStatus: "PENDING_REVIEW", publishedAt: null}});
  if (S.conf) await db.conference.update({where: {id: S.conf.id}, data: {published: S.conf.published, capacity: S.conf.capacity, feeMinor: S.conf.feeMinor}});
  await db.$disconnect();
});

test("seed is idempotent; public list = 3 regular in order; legacy drafts are 404", async () => {
  const seed = () => execFileSync("npx", ["tsx", "scripts/seed-programmes.ts", "--confirm"], {encoding: "utf8", env: process.env});
  seed(); assert.match(seed(), /0 created/);
  assert.equal(await db.programmeItem.count({where: {slug: {in: [...REG, ...LEG]}}}), 6, "no duplicates on re-run");
  const legacy = await db.programmeItem.findMany({where: {sourceSystem: "ICEE"}, orderBy: {displayOrder: "asc"}});
  assert.deepEqual(legacy.map(l => [l.sourceId, l.isLegacy, l.status, l.editorialStatus]), [["4", true, "DRAFT", "PENDING_REVIEW"], ["3", true, "DRAFT", "PENDING_REVIEW"], ["2", true, "DRAFT", "PENDING_REVIEW"]]);
  await db.programmeItem.updateMany({where: {slug: {in: LEG}}, data: {status: "DRAFT"}});
  const list = await pub("/api/public/programmes?locale=en");
  assert.deepEqual(list.body.items.filter(i => REG.includes(i.slug) || LEG.includes(i.slug)).map(i => i.slug), REG);
  assert.equal(list.body.items[0].title, "Mining Downstream Industry & Green Mining Conference");
  const zh = await pub("/api/public/programmes?locale=zh");
  assert.equal(zh.body.items.find(i => i.slug === REG[1]).title, "中国—印度尼西亚煤炭与能源大会");
  for (const s of REG) { const d = await pub(`/api/public/programmes/${s}?locale=en`); ok(d, 200, s); assert.ok(d.body.item.highlights.length >= 3); assert.equal(d.body.item.conference, null, "no booking link unless verified"); }
  ok(await pub(`/api/public/programmes/${LEG[0]}?locale=en`), 404, "draft hidden");
  ok(await pub("/api/public/programmes/NOT_A_SLUG"), 404, "invalid slug");
  assert.equal(await exists(`/programme/${REG[0]}/`), 204); assert.equal(await exists(`/zh/programme/${REG[0]}/?x=1`), 204);
  assert.equal(await exists(`/programme/${LEG[0]}/`), 403); assert.equal(await exists("/programme/../etc/"), 403); assert.equal(await exists(""), 403);
});

test("CMS: RBAC, validation, duplicates, confirmed facts, editorial approval, legacy always last, reorder", async () => {
  const [ED, OPS, SA, VIEW] = await Promise.all([adminLogin("CONTENT_EDITOR"), adminLogin("OPERATIONS"), adminLogin("SUPER_ADMIN"), adminLogin("VIEWER")]);
  ok(await VIEW.post("/api/admin/programme-items", item("v-" + run)), 403, "viewer cannot create");
  ok(await VIEW.get("/api/admin/programme-items"), 200, "viewer can read");
  ok(await ED.post("/api/admin/programme-items", item("Bad Slug")), 400, "slug validation");
  ok(await ED.post("/api/admin/programme-items", item("x-" + run, {imageUrl: "javascript:alert(1)"})), 400, "unsafe image URL");
  ok(await ED.post("/api/admin/programme-items", item("c-" + run, {eventDate: "2027-05-26", dateConfirmed: true})), 403, "editor cannot confirm facts");
  const c = await ED.post("/api/admin/programme-items", item("e2e-" + run, {eventDate: "2027-05-26", venue: "Hall X", displayOrder: 5})); ok(c, 201, "create draft");
  S.id = c.body.item.id;
  ok(await ED.post("/api/admin/programme-items", item("e2e-" + run)), 409, "duplicate slug");
  const dupSrc = await ED.post("/api/admin/programme-items", item("dup-" + run, {sourceSystem: "ICEE", sourceId: "4"})); ok(dupSrc, 409, "duplicate source import");
  ok(await pub(`/api/public/programmes/e2e-${run}`), 404, "draft not public");
  // Preview for signed-in staff only.
  const cookie = [...SA.jar].map(([k, v]) => k + "=" + v).join("; ");
  assert.equal((await fetch(BASE + `/api/public/programmes/e2e-${run}?preview=1`, {headers: {cookie}})).status, 200, "staff preview");
  ok(await pub(`/api/public/programmes/e2e-${run}?preview=1`), 404, "anonymous preview refused");
  assert.equal(await exists(`/programme/e2e-${run}/`, cookie), 204, "nginx check lets staff preview a draft");
  ok(await ED.post(`/api/admin/programme-items/${S.id}/action`, {action: "publish", reason: "e2e publish"}), 200, "publish");
  let d = (await pub(`/api/public/programmes/e2e-${run}?locale=en`)).body.item;
  assert.deepEqual(d.facts, {date: null, time: null, venue: null, fee: null}, "unconfirmed facts hidden");
  assert.equal(d.fallback, false); assert.equal((await pub(`/api/public/programmes/e2e-${run}?locale=zh`)).body.item.fallback, true, "EN fallback flagged on 中文");
  const full = (await ED.get(`/api/admin/programme-items/${S.id}`)).body.item;
  const body = (x) => ({slug: full.slug, category: full.category, programmeStatus: full.programmeStatus, isLegacy: full.isLegacy, displayOrder: full.displayOrder, eventDate: "2027-05-26", venue: "Hall X",
    translations: {en: {title: x.title || "E2E programme e2e-" + run, summary: "A short summary for testing.", overview: "Overview paragraph.", highlights: ["One", "Two"]}}, ...x.extra, reason: x.reason || "e2e edit"});
  ok(await OPS.put(`/api/admin/programme-items/${S.id}`, body({extra: {dateConfirmed: true, venueConfirmed: true}})), 200, "operations confirms facts");
  d = (await pub(`/api/public/programmes/e2e-${run}?locale=en`)).body.item;
  assert.deepEqual([d.facts.date, d.facts.venue], ["2027-05-26", "Hall X"]);
  // Rollback to the published version (v1) restores the content.
  ok(await ED.put(`/api/admin/programme-items/${S.id}`, body({title: "Changed title " + run, extra: {dateConfirmed: true, venueConfirmed: true}})), 200, "edit title");
  assert.match((await pub(`/api/public/programmes/e2e-${run}`)).body.item.title, /Changed title/);
  ok(await ED.post(`/api/admin/programme-items/${S.id}/action`, {action: "rollback", version: 1, reason: "e2e rollback"}), 200, "rollback");
  assert.equal((await pub(`/api/public/programmes/e2e-${run}`)).body.item.title, "E2E programme e2e-" + run);
  assert.ok(await db.auditLog.findFirst({where: {resourceId: S.id, action: "PROGRAMME_ROLLED_BACK"}}));
  // Legacy: needs Product Owner approval, then always sorts after regular programmes.
  const leg = await db.programmeItem.findFirstOrThrow({where: {slug: LEG[0]}});
  ok(await ED.post(`/api/admin/programme-items/${leg.id}/action`, {action: "publish", reason: "attempt by test"}), 409, "unapproved import");
  ok(await ED.post(`/api/admin/programme-items/${leg.id}/action`, {action: "approve", reason: "attempt by test"}), 403, "editor cannot approve");
  for (const s of LEG) { const l = await db.programmeItem.findFirstOrThrow({where: {slug: s}});
    ok(await SA.post(`/api/admin/programme-items/${l.id}/action`, {action: "approve", reason: "PO approved"}), 200, "approve " + s);
    ok(await SA.post(`/api/admin/programme-items/${l.id}/action`, {action: "publish", reason: "PO approved"}), 200, "publish " + s); }
  let slugs = (await pub("/api/public/programmes")).body.items.map(i => i.slug);
  assert.deepEqual(slugs.filter(s => REG.includes(s) || LEG.includes(s)), [...REG, ...LEG], "legacy 4, 3, 2 after regular");
  assert.ok(slugs.indexOf("e2e-" + run) < slugs.indexOf(LEG[0]), "new regular item before legacy");
  const legIds = await Promise.all(LEG.map(s => db.programmeItem.findFirstOrThrow({where: {slug: s}}).then(x => x.id)));
  ok(await ED.post("/api/admin/programme-items/reorder", {group: "regular", ids: legIds}), 400, "cannot reorder legacy into regular group");
  ok(await ED.post("/api/admin/programme-items/reorder", {group: "legacy", ids: [legIds[2], legIds[0], legIds[1]]}), 200, "reorder legacy");
  slugs = (await pub("/api/public/programmes")).body.items.map(i => i.slug).filter(s => LEG.includes(s));
  assert.deepEqual(slugs, [LEG[2], LEG[0], LEG[1]]);
  ok(await ED.post("/api/admin/programme-items/reorder", {group: "legacy", ids: legIds}), 200, "restore legacy order");
  // Unpublish / soft delete / restore.
  ok(await ED.post(`/api/admin/programme-items/${S.id}/action`, {action: "unpublish", reason: "e2e check"}), 200, "unpublish");
  ok(await pub(`/api/public/programmes/e2e-${run}`), 404, "unpublished is 404");
  ok(await ED.post(`/api/admin/programme-items/${S.id}/action`, {action: "delete", reason: "e2e check"}), 200, "soft delete");
  assert.ok((await db.programmeItem.findUniqueOrThrow({where: {id: S.id}})).deletedAt, "kept as deleted");
  ok(await ED.post(`/api/admin/programme-items/${S.id}/action`, {action: "restore", reason: "e2e check"}), 200, "restore");
});

test("conference link: Register only for a published, open conference; a page never creates bookings", async () => {
  const [ED, OPS] = await Promise.all([adminLogin("CONTENT_EDITOR"), adminLogin("OPERATIONS")]);
  S.conf = await db.conference.findFirstOrThrow({where: {event: {code: "IMDX-2027"}}});
  const enrollments = await db.enrollment.count(), invoices = await db.invoice.count();
  const full = (await ED.get(`/api/admin/programme-items/${S.id}`)).body.item;
  const put = (who, conferenceId) => who.put(`/api/admin/programme-items/${S.id}`, {slug: full.slug, conferenceId, translations: {en: {title: "E2E programme e2e-" + run, summary: "A short summary for testing.", overview: "Overview paragraph.", highlights: []}}, reason: "link"});
  ok(await put(ED, S.conf.id), 403, "editor cannot link a bookable conference");
  ok(await put(OPS, S.conf.id), 200, "operations links");
  ok(await OPS.post(`/api/admin/programme-items/${S.id}/action`, {action: "publish", reason: "e2e check"}), 200, "publish");
  await db.conference.update({where: {id: S.conf.id}, data: {published: false}});
  assert.equal((await pub(`/api/public/programmes/e2e-${run}`)).body.item.conference, null, "unpublished conference → no button");
  await db.conference.update({where: {id: S.conf.id}, data: {published: true, capacity: 50, feeMinor: 0n}});
  await db.event.update({where: {code: "IMDX-2027"}, data: {published: true}});
  const cta = (await pub(`/api/public/programmes/e2e-${run}`)).body.item.conference;
  assert.deepEqual(cta, {href: "/conferences/" + S.conf.slug, state: "AVAILABLE"});
  assert.equal(await db.enrollment.count(), enrollments, "no enrollment created"); assert.equal(await db.invoice.count(), invoices, "no invoice created");
  assert.equal((await db.conference.findUniqueOrThrow({where: {id: S.conf.id}})).capacity, 50, "conference capacity untouched by the page");
});
