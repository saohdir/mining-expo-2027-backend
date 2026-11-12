// Owner setting "Public floor plan display": booked booths show the company (approved public name or admin-entered
// company) or only "Not available"; available booths carry their booth-category colour.
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, Client} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
let planId = null, OPS = null;
// Remove the test floor completely: a leftover published floor makes later tests see "several floors live".
test.after(async () => {
  await db.appSetting.deleteMany({where: {key: "floorplan.publicDisplay"}});
  if (planId && OPS) {
    await OPS.post(`/api/admin/floorplans/${planId}/activation`, {active: false, reason: "E2E cleanup public display"}).catch(() => {});
    const del = await OPS.del(`/api/admin/floorplans/${planId}`, {reason: "E2E cleanup public display"}).catch(() => null);
    if (!del || del.status !== 200) await db.floorplan.delete({where: {id: planId}}).catch(() => {});
  }
  await db.$disconnect();
});
const unit = (code, x = 0) => ({code, category: "Standard", x, y: 0, w: 40, h: 40, areaSqm: 9});

test("public floor plan: company names or only Not available, category colour for available booths", async () => {
  const SA = await adminLogin("SUPER_ADMIN"), SALES = await adminLogin("SALES"); OPS = await adminLogin("OPERATIONS");
  ok(await SA.patch("/api/admin/events", {published: true, visitorOpen: true, reason: "E2E public display"}), 200, "event");
  const d = await OPS.post("/api/admin/floorplans", {title: "Display " + run, newFloor: true}); ok(d, 201, "draft"); planId = d.body.plan.id;
  let plan = (await OPS.get("/api/admin/floorplans/" + planId)).body.plan;
  ok(await OPS.put(`/api/admin/floorplans/${planId}/units`, {rowVersion: plan.rowVersion, units: [unit("P1"), unit("P2", 60), unit("P3", 120)]}), 200, "units");
  plan = (await OPS.get("/api/admin/floorplans/" + planId)).body.plan;
  ok(await OPS.post(`/api/admin/floorplans/${planId}/publish`, {rowVersion: plan.rowVersion}), 200, "publish");
  plan = (await OPS.get("/api/admin/floorplans/" + planId)).body.plan;
  const id = c => plan.units.find(u => u.code === c).id;
  ok(await OPS.put(`/api/admin/floorplans/${planId}/units/${id("P2")}/occupant`, {company: "PT Contoh Tambang", status: "OCCUPIED", reason: "E2E occupant entry"}), 200, "occupant");
  ok(await OPS.put(`/api/admin/floorplans/${planId}/units/${id("P3")}/occupant`, {company: "PT Reserved Co", status: "RESERVED", reason: "E2E reserved entry"}), 200, "reserved");
  const pub = async () => (await new Client("anon").get(`/api/public/floorplan?floor=${planId}&_=${Math.random()}`)).body;
  const by = p => Object.fromEntries(p.units.map(u => [u.code, u]));

  // Default: names.
  ok(await OPS.get("/api/admin/floorplans/public-display"), 200, "read"); assert.equal((await OPS.get("/api/admin/floorplans/public-display")).body.display, "names");
  let p = await pub(); assert.equal(p.display, "names");
  assert.equal(by(p).P2.status, "OCCUPIED"); assert.equal(by(p).P2.approvedPublicName, "PT Contoh Tambang");
  assert.equal(by(p).P3.status, "RESERVED"); assert.equal(by(p).P3.approvedPublicName, "PT Reserved Co");
  assert.equal(by(p).P1.status, "AVAILABLE"); assert.equal(by(p).P1.approvedPublicName, null); assert.ok("categoryColor" in by(p).P1);
  assert.ok(!JSON.stringify(p).includes("occupantCompany"), "raw admin field never exposed");

  // Only "Not available".
  ok(await SALES.req("PUT", "/api/admin/floorplans/public-display", {display: "status"}), 403, "sales cannot change");
  ok(await OPS.req("PUT", "/api/admin/floorplans/public-display", {display: "status", reason: "Hide names before launch"}), 200, "hide names");
  p = await pub(); assert.equal(p.display, "status");
  assert.deepEqual([by(p).P2.status, by(p).P3.status, by(p).P1.status], ["UNAVAILABLE", "UNAVAILABLE", "AVAILABLE"]);
  assert.ok(!JSON.stringify(p).includes("PT Contoh Tambang") && !JSON.stringify(p).includes("PT Reserved Co"), "no company names");
  assert.ok(await db.auditLog.findFirst({where: {action: "FLOORPLAN_PUBLIC_DISPLAY", afterState: {path: ["display"], equals: "status"}}}));

  ok(await OPS.req("PUT", "/api/admin/floorplans/public-display", {display: "names"}), 200, "back to names");
  assert.equal(by(await pub()).P2.approvedPublicName, "PT Contoh Tambang");
  // Clean up now (also covered by the after hook if an assertion fails earlier).
  ok(await OPS.post(`/api/admin/floorplans/${planId}/activation`, {active: false, reason: "E2E cleanup public display"}), 200, "inactive");
  ok(await OPS.del(`/api/admin/floorplans/${planId}`, {reason: "E2E cleanup public display"}), 200, "delete test floor");
  assert.equal(await db.floorplan.count({where: {id: planId}}), 0); planId = null;
});
