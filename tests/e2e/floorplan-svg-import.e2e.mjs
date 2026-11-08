// FR-113 (P2): booth units from SVG element IDs — dry run, apply into draft only, unsafe SVG rejected, RBAC.
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
test.after(() => db.$disconnect());
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300"><rect id="booth-S1" x="10" y="10" width="30" height="20" data-category="Standard"/><rect id="booth-S2" x="60" y="10" width="60" height="30"/><circle id="booth-S3" cx="1" cy="1" r="1"/></svg>`;

test("FR-113: preview → apply → re-apply updates; draft only; unsafe SVG; RBAC", async () => {
  const OPS = await adminLogin("OPERATIONS"), SALES = await adminLogin("SALES");
  const p = await OPS.post("/api/admin/floorplans", {title: "SVG import " + run, canvasWidth: 1000, canvasHeight: 600}); ok(p, 201, "draft");
  const url = `/api/admin/floorplans/${p.body.plan.id}/svg-units`;
  ok(await SALES.post(url, {svg, unitsPerMetre: 10, rowVersion: p.body.plan.rowVersion}), 403, "sales");
  ok(await OPS.post(url, {svg: svg.replace("<rect", "<script>x</script><rect"), unitsPerMetre: 10, rowVersion: p.body.plan.rowVersion}), 400, "unsafe svg");
  const dry = await OPS.post(url, {svg, unitsPerMetre: 10, rowVersion: p.body.plan.rowVersion}); ok(dry, 200, "dry run");
  assert.deepEqual(dry.body.units.map(u => [u.code, u.action, u.x, u.w, u.lengthM]), [["S1", "CREATE", 20, 60, 3], ["S2", "CREATE", 120, 120, 6]]);
  assert.equal(dry.body.warnings.length, 1);
  assert.equal(await db.boothUnit.count({where: {floorplanId: p.body.plan.id}}), 0, "dry run writes nothing");
  const ap = await OPS.post(url, {svg, unitsPerMetre: 10, dryRun: false, rowVersion: p.body.plan.rowVersion}); ok(ap, 200, "apply");
  assert.equal(ap.body.created, 2);
  ok(await OPS.post(url, {svg, unitsPerMetre: 10, dryRun: false, rowVersion: p.body.plan.rowVersion}), 409, "stale rowVersion");
  const again = await OPS.post(url, {svg: svg.replace('width="30"', 'width="40"'), unitsPerMetre: 10, dryRun: false, rowVersion: ap.body.rowVersion}); ok(again, 200, "re-apply");
  assert.equal(again.body.updated, 2);
  const s1 = await db.boothUnit.findFirst({where: {floorplanId: p.body.plan.id, code: "S1"}});
  assert.equal(Number(s1.areaSqm), 8, "4m × 2m"); assert.equal(s1.placed, true);
  await db.floorplan.update({where: {id: p.body.plan.id}, data: {status: "ARCHIVED"}});
  ok(await OPS.post(url, {svg, unitsPerMetre: 10, dryRun: false, rowVersion: ap.body.rowVersion + 1}), 409, "not a draft");
});
