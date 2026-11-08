// FR-157: per-session attendance. A programme with its own session zone issues a zone-specific pass;
// only gates serving that zone admit it; attendance report counts unique people per session.
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const zone = "CONF_" + run.toUpperCase();
const R = {}, S = {};
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const scan = (token, gate, z) => R.OPERATIONS.post("/api/admin/check-in/scan", {token, gate, zone: z});
test.after(async () => { if (S.ev) await db.event.update({where: {id: S.ev.id}, data: {startsAt: S.ev.startsAt}}); await db.$disconnect(); });

test("session zone: validation, uniqueness, RBAC", async () => {
  for (const r of ["OPERATIONS", "SALES", "VIEWER"]) R[r] = await adminLogin(r);
  S.ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  if (!S.ev.published) await db.event.update({where: {id: S.ev.id}, data: {published: true}});
  S.conf = await db.conference.create({data: {eventId: S.ev.id, title: "Session zone " + run, slug: "zone-" + run, published: true, capacity: 20, feeMinor: 0n}});
  S.other = await db.conference.create({data: {eventId: S.ev.id, title: "Other session " + run, slug: "zone2-" + run, published: true, capacity: 20}});
  ok(await R.SALES.patch("/api/admin/conferences/" + S.conf.id, {zoneCode: zone, reason: "sales attempt"}), 403, "sales cannot set zone");
  ok(await R.OPERATIONS.patch("/api/admin/conferences/" + S.conf.id, {zoneCode: "bad zone", reason: "invalid zone code"}), 400, "invalid code");
  ok(await R.OPERATIONS.patch("/api/admin/conferences/" + S.conf.id, {zoneCode: zone, reason: "Own session gate for this panel"}), 200, "set zone");
  ok(await R.OPERATIONS.patch("/api/admin/conferences/" + S.other.id, {zoneCode: zone, reason: "same zone twice"}), 409, "zone unique per event");
  ok(await R.OPERATIONS.post("/api/admin/gates", {code: "S" + run, name: "Session room", zones: [zone]}), 201, "session gate");
  ok(await R.OPERATIONS.post("/api/admin/gates", {code: "H" + run, name: "Main hall", zones: ["CONFERENCE"]}), 201, "general gate");
});

test("zone-specific pass: admitted at session gate, rejected at general conference gate; report per session", async () => {
  S.cust = await customerSignup(`zone-${run}@test.local`, "Session Delegate");
  const reg = await S.cust.post("/api/customer/registrations", {kind: "CONFERENCE", conferenceId: S.conf.id, consent: true});
  ok(reg, 201, "register");
  ok(await R.OPERATIONS.post(`/api/admin/registrations/${reg.body.id}/review`, {decision: "CONFIRMED", reason: "Free session confirmed"}), 200, "confirm");
  const passes = (await S.cust.get("/api/customer/passes")).body.passes;
  const p = passes.find(x => x.entitlement === zone);
  assert.ok(p, "session pass issued with the session zone: " + JSON.stringify(passes.map(x => x.entitlement)));
  ok(await R.OPERATIONS.patch("/api/admin/conferences/" + S.conf.id, {zoneCode: null, reason: "change after issue"}), 409, "zone locked once passes exist");
  await db.event.update({where: {id: S.ev.id}, data: {startsAt: new Date(Date.now() - 3600000)}});
  assert.equal((await scan(p.manualCode, "H" + run, "CONFERENCE")).body.result, "WRONG_ZONE", "general gate rejects session pass");
  const acc = await scan(p.manualCode, "S" + run, zone); ok(acc, 200, "session scan");
  assert.equal(acc.body.result, "VALID_ACCEPTED");
  const rep = (await R.VIEWER.get("/api/admin/reports/attendance?zone=" + zone)).body;
  assert.deepEqual(rep.bySession, [{session: "Session zone " + run, uniqueAdmitted: 1}]);
});
