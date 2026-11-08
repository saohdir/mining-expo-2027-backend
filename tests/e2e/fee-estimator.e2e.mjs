// FR-159 (P2): fee estimator — hidden until tariffs are approved; Super Admin only edits; read-only estimate.
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, Client} from "./lib.mjs";

const db = new PrismaClient();
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
test.after(() => db.$disconnect());
const tariffs = {currency: "IDR", categories: [{name: "Standard", perSqmMinor: "3500000", minimumSqm: 9}], packages: [{name: "Shell 9", maxSqm: 9, priceMinor: "30000000", includes: "Walls, fascia, 2 chairs"}], taxNote: "Excludes VAT.", approvedBy: "E2E Organizer", approvedAt: "2026-11-01"};

test("FR-159: estimator lifecycle", async () => {
  const SA = await adminLogin("SUPER_ADMIN"), SALES = await adminLogin("SALES"), anon = new Client("anon");
  await SA.req("PUT", "/api/admin/estimator", {tariffs: null, reason: "Reset before E2E run"});
  ok(await anon.get("/api/public/estimate?area=12"), 503, "no tariffs → hidden");
  ok(await SALES.req("PUT", "/api/admin/estimator", {tariffs, reason: "sales attempt now"}), 403, "sales cannot edit");
  ok(await SA.req("PUT", "/api/admin/estimator", {tariffs: {...tariffs, approvedBy: ""}, reason: "Approved tariff sheet v1"}), 400, "approval required");
  ok(await SA.req("PUT", "/api/admin/estimator", {tariffs, reason: "Approved tariff sheet v1"}), 200, "save");
  assert.equal((await SALES.get("/api/admin/estimator")).body.tariffs.categories[0].name, "Standard", "sales can read");
  const before = await db.boothRequest.count();
  const e = await anon.get("/api/public/estimate?area=6&category=standard"); ok(e, 200, "estimate");
  assert.equal(e.body.estimateMinor, "31500000"); assert.equal(e.body.minimumApplied, true); assert.equal(e.body.package.name, "Shell 9"); assert.match(e.body.disclaimer, /Not a quotation/);
  ok(await anon.get("/api/public/estimate?area=0"), 400, "bad area");
  ok(await anon.get("/api/public/estimate?area=10&category=Gold"), 404, "unknown category");
  assert.equal(await db.boothRequest.count(), before, "estimate never creates a request");
  assert.ok(await db.auditLog.count({where: {action: "ESTIMATOR_TARIFFS_CHANGED"}}) >= 2);
});
