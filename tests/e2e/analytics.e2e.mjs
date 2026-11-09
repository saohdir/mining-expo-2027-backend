// NFR-10: funnel counters move with business events, contain no PII, and are readable only by staff.
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup, Client} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
test.after(() => db.$disconnect());

test("NFR-10: OTP, registration, pass, scan counters; no PII columns; RBAC", async () => {
  const V = await adminLogin("VIEWER"), SA = await adminLogin("SUPER_ADMIN"), OPS = await adminLogin("OPERATIONS");
  ok(await new Client("anon").get("/api/admin/reports/analytics"), 401, "staff only");
  ok(await V.get("/api/admin/reports/analytics?from=2026-13-01"), 400, "bad date");
  const before = (await V.get("/api/admin/reports/analytics")).body.totals;
  const ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  await db.event.update({where: {id: ev.id}, data: {published: true, visitorOpen: true, startsAt: new Date(Date.now() - 3600000)}});
  try {
    const c = await customerSignup(`an-${run}@test.local`, "Analytics Person");
    ok(await c.post("/api/customer/registrations", {kind: "VISITOR", consent: true}), 201, "visitor");
    const code = (await c.get("/api/customer/passes")).body.passes[0].manualCode;
    ok(await OPS.post("/api/admin/gates", {code: "AN" + run, name: "Analytics gate", zones: ["EXPO_ENTRY"]}), 201, "gate");
    assert.equal((await SA.post("/api/admin/check-in/scan", {token: code, gate: "AN" + run, zone: "EXPO_ENTRY"})).body.result, "VALID_ACCEPTED");
    assert.equal((await SA.post("/api/admin/check-in/scan", {token: code, gate: "AN" + run, zone: "EXPO_ENTRY"})).body.result, "ALREADY_CHECKED_IN");
  } finally { await db.event.update({where: {id: ev.id}, data: {startsAt: ev.startsAt, published: ev.published, visitorOpen: ev.visitorOpen}}); }
  const after = (await V.get("/api/admin/reports/analytics")).body;
  for (const [e, n] of [["otp_requested", 1], ["otp_verified", 1], ["registration_started", 1], ["qr_pass_issued", 1], ["checkin_accepted", 1], ["checkin_denied", 1]])
    assert.ok(after.totals[e] >= (before[e] || 0) + n, e + " counted: " + JSON.stringify(after.totals));
  const cols = await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'AnalyticsDaily' ORDER BY 1`;
  assert.deepEqual(cols.map(c => c.column_name), ["count", "day", "event"], "no personal data columns");
});
