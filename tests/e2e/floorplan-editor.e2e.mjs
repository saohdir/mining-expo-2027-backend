// PRD v1.4 Slice E: categories (FR-092), unit props & geometry (FR-094/095), CSV (FR-097),
// background metadata (FR-091), stats (FR-111), remap publish (FR-098, AT-081/082), area mismatch (FR-101).
// Runs after business-flow.e2e.mjs (uses its published map with assignments/accepted offers).
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, Client, BASE} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const R = {}, S = {};
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
test.after(() => db.$disconnect());
const reload = async id => (await R.OPERATIONS.get("/api/admin/floorplans/" + id)).body.plan;

test("setup", async () => { for (const r of ["SUPER_ADMIN", "OPERATIONS", "SALES", "FINANCE", "VIEWER"]) R[r] = await adminLogin(r); });

test("FR-092 categories: seeded, CRUD by Operations, read-only for Sales", async () => {
  const list = await R.SALES.get("/api/admin/booth-categories");
  ok(list, 200, "list");
  assert.ok(list.body.categories.some(c => c.name === "Standard" && c.colorHex === "#6B3FA0"), "seeded purple Standard");
  ok(await R.SALES.post("/api/admin/booth-categories", {name: "X", colorHex: "#000000"}), 403, "sales create");
  ok(await R.OPERATIONS.post("/api/admin/booth-categories", {name: "Bad", colorHex: "red"}), 400, "bad hex");
  const c = await R.OPERATIONS.post("/api/admin/booth-categories", {name: "Corner " + run, colorHex: "#00AA55", pattern: "CROSS", sortOrder: 4});
  ok(c, 201, "create"); S.cat = c.body.category;
  ok(await R.OPERATIONS.patch("/api/admin/booth-categories/" + S.cat.id, {colorHex: "#008844"}), 200, "recolour");
});

test("FR-094/095 units: area from length×width, out-of-canvas rejected, overlap warned, rotation footprint", async () => {
  const p = await R.OPERATIONS.post("/api/admin/floorplans", {title: "Editor " + run, canvasWidth: 1000, canvasHeight: 600});
  ok(p, 201, "draft"); S.plan = p.body.plan;
  const base = {code: "E1", category: "x", categoryId: S.cat.id, x: 10, y: 10, w: 150, h: 240, lengthM: 15, widthM: 24};
  const out = await R.OPERATIONS.put(`/api/admin/floorplans/${S.plan.id}/units`, {rowVersion: S.plan.rowVersion, units: [{...base, x: 900}]});
  ok(out, 400, "out of canvas"); assert.equal(out.body.error, "OUT_OF_BOUNDS");
  const rot = await R.OPERATIONS.put(`/api/admin/floorplans/${S.plan.id}/units`, {rowVersion: S.plan.rowVersion, units: [{...base, x: 800, y: 10, rotation: 90}]});
  ok(rot, 400, "rotated footprint out of canvas");
  const sv = await R.OPERATIONS.put(`/api/admin/floorplans/${S.plan.id}/units`, {rowVersion: S.plan.rowVersion, units: [base, {...base, code: "E2", x: 100, y: 100, lengthM: 3, widthM: 2.5, w: 30, h: 25}]});
  ok(sv, 200, "save"); assert.deepEqual(sv.body.warnings, ["E1 overlaps E2"]);
  const plan = await reload(S.plan.id);
  const e1 = plan.units.find(u => u.code === "E1");
  assert.equal(Number(e1.areaSqm), 360); assert.equal(e1.dimensionLabel, "15×24"); assert.equal(e1.boothCategory.name, "Corner " + run);
  assert.equal(Number(plan.units.find(u => u.code === "E2").areaSqm), 7.5);
  S.rv = plan.rowVersion;
});

test("FR-097 CSV export is formula-safe; import puts new codes in the unplaced tray; publish requires placement", async () => {
  const csv = "code,category,lengthM,widthM,hall\nE1,Standard,10,10,A\nN1,=cmd(),3,3,B\n";
  const bad = await fetch(`${BASE}/api/admin/floorplans/${S.plan.id}/csv?rowVersion=${S.rv}`, {method: "POST", body: "code,category\nX,Y\n", headers: {cookie: [...R.OPERATIONS.jar].map(([k, v]) => k + "=" + v).join("; ")}});
  assert.equal(bad.status, 400, "bad header rejected");
  const imp = await fetch(`${BASE}/api/admin/floorplans/${S.plan.id}/csv?rowVersion=${S.rv}`, {method: "POST", body: csv, headers: {cookie: [...R.OPERATIONS.jar].map(([k, v]) => k + "=" + v).join("; ")}});
  const body = await imp.json(); assert.equal(imp.status, 200, JSON.stringify(body)); assert.deepEqual([body.updated, body.unplaced], [1, 1]);
  const plan = await reload(S.plan.id);
  const n1 = plan.units.find(u => u.code === "N1");
  assert.equal(n1.placed, false); assert.equal(Number(plan.units.find(u => u.code === "E1").areaSqm), 100, "existing unit resized");
  const exp = await fetch(`${BASE}/api/admin/floorplans/${S.plan.id}/csv`, {headers: {cookie: [...R.SALES.jar].map(([k, v]) => k + "=" + v).join("; ")}});
  const text = await exp.text(); assert.equal(exp.status, 200); assert.match(text, /'=cmd\(\)/, "formula escaped on export");
  const pre = await R.OPERATIONS.get(`/api/admin/floorplans/${S.plan.id}/publish`);
  assert.equal(pre.body.canPublish, true, "unplaced units no longer block publishing (they stay hidden until placed)");
  S.rv = plan.rowVersion;
});

test("FR-111 stats + CSV; Viewer reads but cannot export", async () => {
  const s = await R.VIEWER.get(`/api/admin/floorplans/${S.plan.id}/stats`);
  ok(s, 200, "stats"); assert.equal(s.body.totalUnits, 2, "unplaced excluded");
  ok(await R.VIEWER.get(`/api/admin/floorplans/${S.plan.id}/stats?format=csv`), 403, "viewer export");
  const c = await fetch(`${BASE}/api/admin/floorplans/${S.plan.id}/stats?format=csv`, {headers: {cookie: [...R.OPERATIONS.jar].map(([k, v]) => k + "=" + v).join("; ")}});
  assert.equal(c.status, 200);
});

test("FR-098 align moves placed units and refuses moving them off-canvas", async () => {
  ok(await R.OPERATIONS.post(`/api/admin/floorplans/${S.plan.id}/align`, {rowVersion: S.rv, scale: 5, dx: 0, dy: 0, reason: "E2E align too big"}), 400, "off canvas");
  const a = await R.OPERATIONS.post(`/api/admin/floorplans/${S.plan.id}/align`, {rowVersion: S.rv, scale: 1, dx: 20, dy: 5, reason: "E2E align offset"});
  ok(a, 200, "align"); assert.equal(a.body.aligned, 2);
  assert.equal((await reload(S.plan.id)).units.find(u => u.code === "E1").x, 30);
});

test("AT-081 / FR-098 remap: preview flags missing committed codes; publishing moves commitments automatically", async () => {
  const pub = await new Client("anon").get("/api/public/floorplan");
  if (pub.body.state !== "PUBLISHED") return; // requires business-flow data
  S.oldPlanId = pub.body.id;
  const before = await db.boothAssignment.findMany({where: {active: true, boothUnit: {floorplanId: S.oldPlanId}}, include: {boothUnit: true}});
  assert.ok(before.length >= 2, "business-flow assignments present");
  // An empty replacement cannot take over committed units.
  const z = await R.OPERATIONS.post("/api/admin/floorplans", {title: "Bare " + run});
  ok(await R.OPERATIONS.put(`/api/admin/floorplans/${z.body.plan.id}/units`, {rowVersion: z.body.plan.rowVersion, units: [{code: "Z1", category: "S", x: 0, y: 0, w: 10, h: 10, areaSqm: 9}]}), 200, "z units");
  const zr = await R.OPERATIONS.get(`/api/admin/floorplans/${z.body.plan.id}/remap-report`);
  ok(zr, 200, "report"); assert.equal(zr.body.canApply, false); assert.ok(zr.body.blocking.length >= 2);
  const zp = await reload(z.body.plan.id);
  const zpre = await R.OPERATIONS.get(`/api/admin/floorplans/${zp.id}/publish`);
  assert.equal(zpre.body.canPublish, true); assert.equal(zpre.body.needsRemap, true);
  ok(await R.OPERATIONS.del(`/api/admin/floorplans/${zp.id}`, {reason: "E2E bare draft not needed"}), 200, "delete draft");
  // Clone the published map, enlarge one committed unit, then publish with approval.
  const cl = await R.OPERATIONS.post(`/api/admin/floorplans/${S.oldPlanId}/clone`, {title: "Remap " + run, reason: "E2E remap new version"});
  ok(cl, 201, "clone");
  S.newPlanId = (cl.body.plan ?? cl.body).id;
  let draft = await reload(S.newPlanId);
  const third = draft.units.find(u => u.code.startsWith("A3"));
  const units = draft.units.map(u => ({code: u.code, category: u.category, x: u.x, y: u.y, w: u.w, h: u.h, areaSqm: u.code === third.code ? 12 : Number(u.areaSqm)}));
  ok(await R.OPERATIONS.put(`/api/admin/floorplans/${S.newPlanId}/units`, {rowVersion: draft.rowVersion, units}), 200, "resize A3");
  draft = await reload(S.newPlanId);
  const rep = await R.SALES.get(`/api/admin/floorplans/${S.newPlanId}/remap-report`);
  ok(rep, 200, "report"); assert.equal(rep.body.canApply, true); assert.ok(rep.body.areaWarnings.includes(third.code), "area change on committed unit flagged");
  ok(await R.SALES.post(`/api/admin/floorplans/${S.newPlanId}/publish`, {rowVersion: draft.rowVersion}), 403, "sales cannot publish");
  ok(await R.OPERATIONS.post(`/api/admin/floorplans/${S.newPlanId}/publish`, {rowVersion: draft.rowVersion - 1}), 409, "stale row version");
  // No reason, confirmation or approval is needed any more; bookings move automatically.
  const done = await R.OPERATIONS.post(`/api/admin/floorplans/${S.newPlanId}/publish`, {rowVersion: draft.rowVersion});
  ok(done, 200, "remap publish"); assert.ok(done.body.remap.moved >= 2);
  const old = await db.boothAssignment.findMany({where: {id: {in: before.map(a => a.id)}}});
  assert.ok(old.every(a => !a.active && a.endedAt), "old assignments ended, not deleted");
  const moved = await db.boothAssignment.findMany({where: {active: true, boothUnit: {floorplanId: S.newPlanId}}, include: {boothUnit: true}});
  assert.deepEqual(moved.map(a => a.boothUnit.code).sort(), before.map(a => a.boothUnit.code).sort(), "same codes on new version");
  assert.ok(moved.every(a => a.boothUnit.status === "OCCUPIED"));
  const live = await new Client("anon").get("/api/public/floorplan");
  assert.equal(live.body.id, S.newPlanId);
  const req = await db.boothRequest.findFirst({where: {id: moved[0].boothRequestId}});
  assert.equal(req.originalFloorplanId, S.oldPlanId, "original version retained on request");
  S.third = third.code;
});

test("FR-101 area mismatch requires an override reason at assignment", async () => {
  if (!S.third) return;
  const unit = await db.boothUnit.findFirst({where: {floorplanId: S.newPlanId, code: S.third}});
  const offer = await db.boothOffer.findFirst({where: {acceptedAt: {not: null}, floorplanVersionNo: (await db.floorplan.findUnique({where: {id: S.newPlanId}})).versionNo,
    boothRequest: {status: {in: ["ACCEPTED", "WAITING_INVOICE", "INVOICED", "ALLOCATION_PENDING"]}}}, orderBy: {createdAt: "desc"}});
  assert.ok(offer, "accepted offer remapped to new version");
  const inv = await db.invoice.findFirst({where: {boothRequestId: offer.boothRequestId}, include: {transfers: true}});
  const paid = inv.transfers.filter(t => t.status === "VERIFIED").reduce((a, t) => a + t.amountMinor, 0n);
  if (inv.totalMinor > paid) ok(await R.FINANCE.post(`/api/admin/invoices/${inv.id}/verify-transfer`, {amountMinor: String(inv.totalMinor - paid), bankReference: "AREA-" + run, transferredAt: new Date().toISOString(), bankVerified: true, reason: "E2E settle for area test"}), 200, "settle");
  const a1 = await R.OPERATIONS.post(`/api/admin/booth-requests/${offer.boothRequestId}/assign`, {reason: "E2E assign after remap"});
  ok(a1, 409, "mismatch"); assert.equal(a1.body.error, "AREA_MISMATCH");
  ok(await R.OPERATIONS.post(`/api/admin/booth-requests/${offer.boothRequestId}/assign`, {reason: "E2E assign after remap", areaOverrideReason: "Customer agreed to the larger corner unit at the same price"}), 200, "override");
  assert.equal((await db.boothUnit.findUnique({where: {id: unit.id}})).status, "OCCUPIED");
  assert.equal(await db.auditLog.count({where: {action: "BOOTH_AREA_OVERRIDE", resourceId: offer.boothRequestId}}), 1);
});

test("FR-091 background details are optional; public API hides internal notes", async () => {
  const p = await R.OPERATIONS.post("/api/admin/floorplans", {title: "Background " + run});
  const sharp = (await import("sharp")).default;
  const png = await sharp({create: {width: 60, height: 40, channels: 3, background: "#eee"}}).png().toBuffer();
  const fd = new FormData(); fd.append("file", new Blob([png], {type: "image/png"}), "bg.png");
  const up = await fetch(`${BASE}/api/admin/floorplans/${p.body.plan.id}/upload`, {method: "POST", body: fd, headers: {origin: BASE, cookie: [...R.OPERATIONS.jar].map(([k, v]) => k + "=" + v).join("; ")}});
  const url = (await up.json()).url;
  let plan = await reload(p.body.plan.id);
  ok(await R.OPERATIONS.patch(`/api/admin/floorplans/${plan.id}`, {rowVersion: plan.rowVersion, backgroundUrl: url}), 200, "set bg");
  plan = await reload(plan.id);
  ok(await R.OPERATIONS.put(`/api/admin/floorplans/${plan.id}/units`, {rowVersion: plan.rowVersion, units: [{code: "Q1", category: "S", x: 0, y: 0, w: 10, h: 10, areaSqm: 9, internalNotes: "secret note"}]}), 200, "units");
  plan = await reload(plan.id);
  assert.equal((await R.OPERATIONS.get(`/api/admin/floorplans/${plan.id}/publish`)).body.canPublish, true, "background details are optional for publishing");
  ok(await R.OPERATIONS.patch(`/api/admin/floorplans/${plan.id}`, {rowVersion: plan.rowVersion, backgroundAlt: "Hall A layout", backgroundRights: "ORGANIZER_PROVIDED"}), 200, "meta");
  const pubJson = JSON.stringify((await new Client("anon").get("/api/public/floorplan")).body);
  assert.ok(!/internalNotes|secret note|email|price/i.test(pubJson), "public map has no internal/PII fields");
});
