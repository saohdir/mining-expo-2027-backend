// PRD v1.4 Slice G: gate authorization (AT-076), re-entry policy (FR-085), revoke/reissue (FR-137, AT-077),
// manual-code rate limit (FR-086), attendance metrics (FR-087/136).
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup, Client} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const R = {}, S = {};
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
test.after(async () => { if (S.ev) await db.event.update({where: {id: S.ev.id}, data: {startsAt: S.ev.startsAt}}); await db.$disconnect(); });
const scan = (c, token, gate, zone = "EXPO_ENTRY") => c.post("/api/admin/check-in/scan", {token, gate, zone});

test("setup gates, staff and a visitor pass", async () => {
  for (const role of ["SUPER_ADMIN", "OPERATIONS", "CHECKIN_STAFF", "SALES"]) R[role] = await adminLogin(role);
  ok(await R.SUPER_ADMIN.patch("/api/admin/events", {published: true, visitorOpen: true, reason: "E2E admission"}), 200, "event");
  ok(await R.CHECKIN_STAFF.post("/api/admin/gates", {code: "X", name: "x", zones: ["EXPO_ENTRY"]}), 403, "staff cannot create gates");
  const a = await R.OPERATIONS.post("/api/admin/gates", {code: "A" + run, name: "North", zones: ["EXPO_ENTRY"]});
  const b = await R.OPERATIONS.post("/api/admin/gates", {code: "B" + run, name: "Conference", zones: ["CONFERENCE"]});
  ok(a, 201, "gate A"); ok(b, 201, "gate B");
  S.gateA = a.body.gate; S.gateB = b.body.gate;
  const staffId = (await R.CHECKIN_STAFF.get("/api/admin/me")).body.id;
  ok(await R.OPERATIONS.patch("/api/admin/gates/" + S.gateA.id, {staffAdminIds: [staffId], reason: "E2E assign north gate"}), 200, "assign A");
  const mine = await R.CHECKIN_STAFF.get("/api/admin/gates");
  assert.deepEqual(mine.body.gates.map(g => g.code), ["A" + run], "staff sees only assigned gate");
  S.cust = await customerSignup(`adm-${run}@test.local`, "Gate Visitor");
  ok(await S.cust.post("/api/customer/registrations", {kind: "VISITOR", consent: true}), 201, "visitor");
  const p = (await S.cust.get("/api/customer/passes")).body.passes[0];
  S.code = p.manualCode; S.passId = p.passId;
  S.ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  await db.event.update({where: {id: S.ev.id}, data: {startsAt: new Date(Date.now() - 3600000)}});
});

test("AT-076: staff cannot scan at unassigned gate, wrong zone or unknown gate; no admission", async () => {
  ok(await scan(R.CHECKIN_STAFF, S.code, "B" + run, "CONFERENCE"), 403, "unassigned gate");
  ok(await scan(R.CHECKIN_STAFF, S.code, "A" + run, "CONFERENCE"), 403, "zone not served by gate");
  ok(await scan(R.CHECKIN_STAFF, S.code, "NOPE"), 403, "unknown gate");
  ok(await scan(R.SALES, S.code, "A" + run), 403, "sales cannot scan");
  assert.equal(await db.admission.count({where: {passId: S.passId}}), 0, "no admission recorded");
  assert.ok(await db.auditLog.count({where: {action: "SCAN_GATE_DENIED"}}) >= 3, "denials audited");
});

test("ONCE_PER_DAY default, then ALLOW_REENTRY counts entries without new unique person", async () => {
  const first = await scan(R.CHECKIN_STAFF, S.code, "A" + run);
  ok(first, 200, "first entry via short manual code");
  assert.equal(first.body.person.name, "Gate Visitor");
  assert.equal((await scan(R.CHECKIN_STAFF, S.code, "A" + run)).body.result, "ALREADY_CHECKED_IN");
  ok(await R.CHECKIN_STAFF.post("/api/admin/admission-policy", {zone: "EXPO_ENTRY", reentry: "ALLOW_REENTRY", reason: "x"}), 405, "no POST");
  ok(await R.CHECKIN_STAFF.req("PUT", "/api/admin/admission-policy", {zone: "EXPO_ENTRY", reentry: "ALLOW_REENTRY", reason: "staff attempt"}), 403, "staff cannot set policy");
  ok(await R.OPERATIONS.req("PUT", "/api/admin/admission-policy", {zone: "EXPO_ENTRY", reentry: "ALLOW_REENTRY", reason: "E2E re-entry allowed"}), 200, "policy");
  const again = await scan(R.CHECKIN_STAFF, S.code, "A" + run);
  ok(again, 200, "re-entry"); assert.equal(again.body.reentry, true);
  const rep = (await R.OPERATIONS.get("/api/admin/reports/attendance?gate=A" + run)).body;
  assert.equal(rep.admissionEntries, 1, "one unique admission row");
  assert.equal(rep.acceptedEntries, 2, "two successful entries");
  assert.ok(rep.rejectedAttempts >= 1);
  ok(await R.OPERATIONS.req("PUT", "/api/admin/admission-policy", {zone: "EXPO_ENTRY", reentry: "ONCE_PER_DAY", reason: "E2E restore default"}), 200, "restore");
});

test("FR-137 / AT-077: revoke blocks scans; reissue invalidates old code and issues a working new one", async () => {
  ok(await R.SALES.post("/api/admin/passes/" + S.passId + "/revoke", {reason: "sales attempt"}), 403, "sales revoke");
  ok(await R.OPERATIONS.post("/api/admin/passes/" + S.passId + "/reissue", {reason: "Lost phone, new QR"}), 201, "reissue");
  assert.equal((await scan(R.CHECKIN_STAFF, S.code, "A" + run)).body.result, "REVOKED", "old code rejected");
  const fresh = (await S.cust.get("/api/customer/passes")).body.passes;
  assert.equal(fresh.length, 1); assert.notEqual(fresh[0].manualCode, S.code);
  const newRes = await scan(R.CHECKIN_STAFF, fresh[0].manualCode, "A" + run);
  assert.equal(newRes.body.result, "ALREADY_CHECKED_IN", "reissued pass does not grant a second same-day entry");
  ok(await R.OPERATIONS.post("/api/admin/passes/" + fresh[0].passId + "/revoke", {reason: "Registration fraud check"}), 200, "revoke");
  assert.equal((await scan(R.CHECKIN_STAFF, fresh[0].manualCode, "A" + run)).body.result, "REVOKED");
  assert.equal((await S.cust.get("/api/customer/passes")).body.passes.length, 0, "customer no longer sees revoked pass");
});

test("FR-086: repeated invalid manual codes are rate-limited per staff", async () => {
  let last;
  // Uses Operations so other suites' scanner account is not throttled.
  for (let i = 0; i < 16; i++) last = await scan(R.OPERATIONS, "ZZZZZ-" + String(i).padStart(5, "0"), "A" + run);
  ok(last, 429, "guessing throttled");
  ok(await new Client("anon").post("/api/admin/check-in/scan", {token: S.code, gate: "A" + run, zone: "EXPO_ENTRY"}), 401, "no public scanner");
});
