// Floorplan simplification (owner request, Nov 2026): publish without prerequisites, edit booths on a live floor,
// delete drafts / inactive floors / old versions; a replacement keeps every booking (missing booked booths are copied in).
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, Client} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const R = {};
test.after(async () => { await db.$disconnect(); });
const unit = (code, x = 0) => ({code, category: "Standard", x, y: 0, w: 40, h: 40, areaSqm: 9});
const fresh = async id => (await R.OPS.get("/api/admin/floorplans/" + id)).body.plan;

test("publish without prerequisites, edit booths on a live floor, delete drafts and inactive floors", async () => {
  R.OPS = await adminLogin("OPERATIONS"); R.SALES = await adminLogin("SALES");
  // An empty new floor publishes in one call (no reason, no confirmation, no units needed).
  const d = await R.OPS.post("/api/admin/floorplans", {title: "Simple " + run, newFloor: true}); ok(d, 201, "draft");
  const pub = await R.OPS.post(`/api/admin/floorplans/${d.body.plan.id}/publish`, {rowVersion: d.body.plan.rowVersion}); ok(pub, 200, "publish empty floor");
  // Booths are edited directly on the live floor.
  let plan = await fresh(d.body.plan.id); assert.equal(plan.status, "PUBLISHED");
  ok(await R.OPS.put(`/api/admin/floorplans/${plan.id}/units`, {rowVersion: plan.rowVersion, units: [unit("S1"), unit("S2", 60)]}), 200, "edit live units");
  plan = await fresh(plan.id); assert.deepEqual(plan.units.map(u => u.code).sort(), ["S1", "S2"]);
  ok(await R.OPS.patch(`/api/admin/floorplans/${plan.id}`, {rowVersion: plan.rowVersion, title: "Simple live " + run}), 200, "rename live floor");
  // An active floor must be set inactive before it can be deleted; Sales cannot delete.
  ok(await R.OPS.del(`/api/admin/floorplans/${plan.id}`, {}), 409, "active floor");
  plan = await fresh(plan.id);
  ok(await R.OPS.post(`/api/admin/floorplans/${plan.id}/activation`, {active: false, reason: "E2E set inactive"}), 200, "inactive");
  ok(await R.SALES.del(`/api/admin/floorplans/${plan.id}`, {}), 403, "sales cannot delete");
  const del = await R.OPS.del(`/api/admin/floorplans/${plan.id}`, {reason: "E2E remove test floor"}); ok(del, 200, "delete inactive floor");
  assert.equal(del.body.result, "deleted"); ok(await R.OPS.get(`/api/admin/floorplans/${plan.id}`), 404, "gone");

  // A draft with unplaced booths and a background without alt/rights also publishes; drafts can be deleted.
  const d2 = await R.OPS.post("/api/admin/floorplans", {title: "Loose " + run, newFloor: true});
  ok(await R.OPS.put(`/api/admin/floorplans/${d2.body.plan.id}/units`, {rowVersion: d2.body.plan.rowVersion, units: [{...unit("L1"), placed: false}]}), 200, "unplaced unit");
  ok(await R.OPS.patch(`/api/admin/floorplans/${d2.body.plan.id}`, {rowVersion: (await fresh(d2.body.plan.id)).rowVersion, backgroundUrl: "/assets/hall.png"}), 200, "background");
  ok(await R.OPS.post(`/api/admin/floorplans/${d2.body.plan.id}/publish`, {rowVersion: (await fresh(d2.body.plan.id)).rowVersion}), 200, "publish loose draft");
  const p2 = await fresh(d2.body.plan.id);
  ok(await R.OPS.post(`/api/admin/floorplans/${p2.id}/activation`, {active: false, reason: "E2E cleanup loose floor"}), 200, "inactive");
  ok(await R.OPS.del(`/api/admin/floorplans/${p2.id}`, {}), 200, "cleanup");
  const d3 = await R.OPS.post("/api/admin/floorplans", {title: "Throwaway " + run, newFloor: true});
  const gone = await R.OPS.del(`/api/admin/floorplans/${d3.body.plan.id}`, {reason: "E2E not needed"}); ok(gone, 200, "delete draft"); assert.equal(gone.body.result, "deleted");
  assert.ok(await db.auditLog.findFirst({where: {resourceId: d3.body.plan.id, action: "FLOORPLAN_DELETED"}}));
});

test("replacing a live floor keeps every booking: booked booths missing in the draft are copied in", async () => {
  const live = await new Client("anon").get("/api/public/floorplan");
  if (live.body.state !== "PUBLISHED") return;
  const liveId = live.body.id;
  const before = await db.boothAssignment.findMany({where: {active: true, boothUnit: {floorplanId: liveId}}, include: {boothUnit: true}});
  if (!before.length) return; // needs booking data from the business-flow tests
  // A booked booth cannot be removed from the live floor itself.
  const lp = await fresh(liveId);
  const keep = lp.units.filter(u => u.code !== before[0].boothUnit.code).map(u => ({code: u.code, category: u.category, x: u.x, y: u.y, w: u.w, h: u.h, areaSqm: Number(u.areaSqm), rotation: u.rotation || 0, placed: u.placed}));
  ok(await R.OPS.put(`/api/admin/floorplans/${liveId}/units`, {rowVersion: lp.rowVersion, units: keep}), 409, "booked booth stays on the live floor");
  // A new version without that booth: publishing copies it back and moves the booking.
  const cl = await R.OPS.post(`/api/admin/floorplans/${liveId}/clone`, {title: "Without " + run, reason: "E2E drop a booked booth"}); ok(cl, 201, "clone");
  let draft = await fresh(cl.body.plan.id);
  const missing = before[0].boothUnit.code;
  // The clone copies booked booths as blocked; release it, then remove it from the draft.
  const blocked = draft.units.find(u => u.code === missing);
  ok(await R.OPS.post(`/api/admin/floorplans/${draft.id}/units/${blocked.id}/unblock`, {rowVersion: draft.rowVersion, reason: "E2E release to drop it"}), 200, "unblock");
  draft = await fresh(draft.id);
  ok(await R.OPS.put(`/api/admin/floorplans/${draft.id}/units`, {rowVersion: draft.rowVersion, units: draft.units.filter(u => u.code !== missing).map(u => ({code: u.code, category: u.category, x: u.x, y: u.y, w: u.w, h: u.h, areaSqm: Number(u.areaSqm), rotation: u.rotation || 0, placed: u.placed}))}), 200, "draft without the booked booth");
  draft = await fresh(draft.id); assert.ok(!draft.units.some(u => u.code === missing));
  const pub = await R.OPS.post(`/api/admin/floorplans/${draft.id}/publish`, {rowVersion: draft.rowVersion}); ok(pub, 200, "publish replacement");
  assert.ok(pub.body.remap.restoredUnits.includes(missing), JSON.stringify(pub.body.remap));
  const moved = await db.boothAssignment.findMany({where: {active: true, boothUnit: {floorplanId: draft.id}}, include: {boothUnit: true}});
  assert.deepEqual(moved.map(a => a.boothUnit.code).sort(), before.map(a => a.boothUnit.code).sort(), "every booking kept its booth code");
  // The replaced version keeps its booking history, so it cannot be deleted (only archived history).
  const old = await R.OPS.del(`/api/admin/floorplans/${liveId}`, {}); ok(old, 409, "archived with history"); assert.equal(old.body.error, "HAS_HISTORY");
});
