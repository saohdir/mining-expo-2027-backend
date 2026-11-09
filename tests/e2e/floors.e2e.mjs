// Floors (owner request, Nov 2026): several live floors, Active/Inactive for customers, "booked by" (company) per booth,
// split/merge a booth's area on a live floor, and a new version replaces only its own floor.
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const S = {mine: []};
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const R = "Floor test " + run;
test.after(async () => {
  if (S.mine.length) await db.floorplan.updateMany({where: {id: {in: S.mine}}, data: {status: "ARCHIVED"}});
  if (S.ev) await db.event.update({where: {id: S.ev.id}, data: {published: S.ev.published, visitorOpen: S.ev.visitorOpen}});
  await db.$disconnect();
});
const unit = (code, x, area = 10) => ({code, category: "Standard", hall: "F", x, y: 20, w: 100, h: 40, areaSqm: area, lengthM: 5, widthM: 2});
async function liveFloor(OPS, title, extra, units) {
  const d = await OPS.post("/api/admin/floorplans", {title, canvasWidth: 1000, canvasHeight: 400, ...extra}); ok(d, 201, "draft " + title);
  S.mine.push(d.body.plan.id);
  ok(await OPS.put(`/api/admin/floorplans/${d.body.plan.id}/units`, {rowVersion: d.body.plan.rowVersion, units}), 200, "units");
  const pre = await OPS.get(`/api/admin/floorplans/${d.body.plan.id}/publish`); ok(pre, 200, "preflight");
  ok(await OPS.post(`/api/admin/floorplans/${d.body.plan.id}/publish`, {rowVersion: pre.body.rowVersion, reason: R, confirmReconciliation: true}), 200, "publish " + title);
  return d.body.plan.id;
}

test("several live floors; inactive floors are hidden from customers", async () => {
  S.ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  await db.event.update({where: {id: S.ev.id}, data: {published: true, visitorOpen: true}});
  const OPS = S.OPS = await adminLogin("OPERATIONS");
  S.a = await liveFloor(OPS, "Hall A " + run, {newFloor: true}, [unit("FA1", 20), unit("FA2", 140)]);
  S.b = await liveFloor(OPS, "Outdoor " + run, {newFloor: true}, [unit("FB1", 20), unit("FB2", 140)]);
  const live = await db.floorplan.findMany({where: {id: {in: [S.a, S.b]}}});
  assert.deepEqual(live.map(p => p.status), ["PUBLISHED", "PUBLISHED"], "both floors live at once");

  const pub = (await fetch(process.env.E2E_BASE_URL + "/api/public/floorplan?floor=" + S.b).then(r => r.json()));
  assert.equal(pub.id, S.b); assert.ok(pub.floors.some(f => f.id === S.a) && pub.floors.some(f => f.id === S.b), "public lists active floors");

  ok(await (await adminLogin("SALES")).post(`/api/admin/floorplans/${S.b}/activation`, {active: false, reason: R}), 403, "sales cannot switch floors");
  ok(await OPS.post(`/api/admin/floorplans/${S.b}/activation`, {active: false, reason: "short"}), 400, "reason required");
  ok(await OPS.post(`/api/admin/floorplans/${S.b}/activation`, {active: false, reason: R}), 200, "deactivate");
  const pub2 = await fetch(process.env.E2E_BASE_URL + "/api/public/floorplan?floor=" + S.b).then(r => r.json());
  assert.ok(!pub2.floors.some(f => f.id === S.b), "inactive floor hidden"); assert.notEqual(pub2.id, S.b);
  const cust = S.cust = await customerSignup(`floor-${run}@test.local`, "Floor Tester");
  const fb1 = await db.boothUnit.findFirstOrThrow({where: {floorplanId: S.b, code: "FB1"}});
  const base = {floorplanId: S.b, requestedAreaSqm: 10, company: "PT Lantai " + run, picName: "Floor Tester", products: "Drills", location: "INDOOR", consent: true};
  ok(await cust.post("/api/customer/booth-requests", {...base, preferredUnitIds: [fb1.id]}), 409, "no requests on an inactive floor");
  ok(await OPS.post(`/api/admin/floorplans/${S.b}/activation`, {active: true, reason: R}), 200, "activate");
  ok(await cust.post("/api/customer/booth-requests", {...base, preferredUnitIds: [fb1.id]}), 201, "request on active floor");
  assert.ok(await db.auditLog.findFirst({where: {resourceId: S.b, action: "FLOORPLAN_DEACTIVATED"}}));
});

test("who booked each booth: portal requests and manual 'booked by' entries", async () => {
  ok(await (await adminLogin("VIEWER")).get(`/api/admin/floorplans/${S.b}/occupancy`), 403, "viewer");
  const SALES = await adminLogin("SALES");
  const occ = await SALES.get(`/api/admin/floorplans/${S.b}/occupancy`); ok(occ, 200, "occupancy");
  const fb1 = occ.body.units.find(u => u.code === "FB1"), fb2 = occ.body.units.find(u => u.code === "FB2");
  assert.deepEqual(fb1.interested.map(i => i.company), ["PT Lantai " + run], "requesting company shown");
  ok(await SALES.put(`/api/admin/floorplans/${S.b}/units/${fb2.unitId}/occupant`, {company: "PT Offline " + run, contact: "Budi 0812", status: "OCCUPIED", reason: R}), 200, "booked by");
  const occ2 = (await SALES.get(`/api/admin/floorplans/${S.b}/occupancy`)).body;
  const fb2b = occ2.units.find(u => u.code === "FB2");
  assert.deepEqual([fb2b.status, fb2b.occupant.source, fb2b.occupant.company], ["OCCUPIED", "MANUAL", "PT Offline " + run]);
  assert.equal(occ2.summary.booked, 1);
  ok(await S.cust.post("/api/customer/booth-requests", {floorplanId: S.b, requestedAreaSqm: 10, company: "PT X", picName: "Floor Tester", products: "Drills", location: "INDOOR", consent: true, preferredUnitIds: [fb2.unitId]}), 409, "booked booth not requestable");
  ok(await SALES.put(`/api/admin/floorplans/${S.b}/units/${fb2.unitId}/occupant`, {company: null, reason: R}), 200, "clear");
  assert.equal((await db.boothUnit.findUniqueOrThrow({where: {id: fb2.unitId}})).status, "AVAILABLE");
  // Portal holds/assignments carry their own company and cannot be overwritten manually.
  const req = await db.boothRequest.findFirstOrThrow({where: {floorplanId: S.b}});
  await db.boothHold.create({data: {boothUnitId: fb1.unitId, boothRequestId: req.id, createdBy: "e2e", expiresAt: new Date(Date.now() + 3600000)}});
  ok(await SALES.put(`/api/admin/floorplans/${S.b}/units/${fb1.unitId}/occupant`, {company: "PT Other", reason: R}), 409, "portal booking wins");
  const occ3 = (await SALES.get(`/api/admin/floorplans/${S.b}/occupancy`)).body.units.find(u => u.code === "FB1");
  assert.deepEqual([occ3.occupant.source, occ3.occupant.company], ["HOLD", "PT Lantai " + run]);
  await db.boothHold.updateMany({where: {boothUnitId: fb1.unitId}, data: {status: "RELEASED", endedAt: new Date()}});
});

test("split a booth on a live floor (10 m² → 5 + 5) and merge it back", async () => {
  const OPS = S.OPS;
  const fa1 = await db.boothUnit.findFirstOrThrow({where: {floorplanId: S.a, code: "FA1"}});
  ok(await (await adminLogin("SALES")).post(`/api/admin/floorplans/${S.a}/units/${fa1.id}/split`, {keepAreaSqm: 5, reason: R}), 403, "sales cannot split");
  ok(await OPS.post(`/api/admin/floorplans/${S.a}/units/${fa1.id}/split`, {keepAreaSqm: 10, reason: R}), 400, "must leave a remainder");
  const s = await OPS.post(`/api/admin/floorplans/${S.a}/units/${fa1.id}/split`, {keepAreaSqm: 5, reason: R}); ok(s, 200, "split");
  assert.deepEqual([s.body.keep.code, s.body.keep.areaSqm, s.body.rest.code, s.body.rest.areaSqm], ["FA1", 5, "FA1-B", 5]);
  const [a, b] = await Promise.all([db.boothUnit.findUniqueOrThrow({where: {id: fa1.id}}), db.boothUnit.findUniqueOrThrow({where: {id: s.body.rest.id}})]);
  assert.deepEqual([a.w, b.x, b.w, b.status, b.splitFromId], [50, 70, 50, "AVAILABLE", fa1.id], "geometry split side by side");
  // The free half can be booked by another company.
  ok(await OPS.put(`/api/admin/floorplans/${S.a}/units/${fa1.id}/occupant`, {company: "PT Satu " + run, reason: R}), 200, "half for PT Satu");
  ok(await OPS.put(`/api/admin/floorplans/${S.a}/units/${b.id}/occupant`, {company: "PT Dua " + run, reason: R}), 200, "other half for PT Dua");
  ok(await OPS.post(`/api/admin/floorplans/${S.a}/units/${fa1.id}/merge`, {withUnitId: b.id, reason: R}), 409, "booked part cannot be merged");
  ok(await OPS.put(`/api/admin/floorplans/${S.a}/units/${b.id}/occupant`, {company: null, reason: R}), 200, "free it");
  const m = await OPS.post(`/api/admin/floorplans/${S.a}/units/${fa1.id}/merge`, {withUnitId: b.id, reason: R}); ok(m, 200, "merge");
  assert.equal(m.body.unit.areaSqm, 10);
  const back = await db.boothUnit.findUniqueOrThrow({where: {id: fa1.id}});
  assert.deepEqual([back.w, Number(back.lengthM), back.occupantCompany], [100, 5, "PT Satu " + run]);
  assert.equal(await db.boothUnit.count({where: {id: b.id}}), 0);
});

test("a new version replaces only its own floor; ambiguous drafts must choose", async () => {
  const OPS = S.OPS;
  ok(await OPS.post("/api/admin/floorplans", {title: "Ambiguous " + run}), 400, "several live floors → choose");
  const v2 = await liveFloor(OPS, "Hall A v2 " + run, {replacesId: S.a}, [unit("FA1", 20), unit("FA2", 140)]);
  const [a, b, n] = await Promise.all([S.a, S.b, v2].map(id => db.floorplan.findUniqueOrThrow({where: {id}})));
  assert.deepEqual([a.status, b.status, n.status], ["ARCHIVED", "PUBLISHED", "PUBLISHED"], "only Hall A replaced");
  const fa1 = await db.boothUnit.findFirstOrThrow({where: {floorplanId: v2, code: "FA1"}});
  assert.equal(fa1.status, "AVAILABLE");
  // Cloning a live floor keeps manual "booked by" entries.
  ok(await OPS.put(`/api/admin/floorplans/${v2}/units/${fa1.id}/occupant`, {company: "PT Tetap " + run, reason: R}), 200, "booked by on v2");
  const cl = await OPS.post(`/api/admin/floorplans/${v2}/clone`, {title: "Hall A v3 " + run, reason: R}); ok(cl, 201, "clone");
  S.mine.push(cl.body.plan.id);
  assert.equal(cl.body.plan.replacesId, v2, "clone of a live floor replaces that floor");
  const copy = await db.boothUnit.findFirstOrThrow({where: {floorplanId: cl.body.plan.id, code: "FA1"}});
  assert.deepEqual([copy.status, copy.occupantCompany], ["OCCUPIED", "PT Tetap " + run]);
});
