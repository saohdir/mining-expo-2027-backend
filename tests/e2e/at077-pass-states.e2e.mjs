// AT-077: expired, revoked, cancelled or unpaid conference QR → rejected with the correct reason, no admission entry,
// and no participant identity in the response (FR-089).
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const S = {};
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
test.after(async () => { if (S.ev) await db.event.update({where: {id: S.ev.id}, data: {startsAt: S.ev.startsAt, published: S.ev.published, visitorOpen: S.ev.visitorOpen}}); await db.$disconnect(); });

test("AT-077: each invalid pass state is rejected with its reason and never admitted", async () => {
  const SA = await adminLogin("SUPER_ADMIN"), OPS = await adminLogin("OPERATIONS");
  S.ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  await db.event.update({where: {id: S.ev.id}, data: {published: true, visitorOpen: true, startsAt: new Date(Date.now() - 3600000)}});
  ok(await OPS.post("/api/admin/gates", {code: "T" + run, name: "AT-077 gate", zones: ["EXPO_ENTRY", "CONFERENCE"]}), 201, "gate");
  const scan = (code, zone = "EXPO_ENTRY") => SA.post("/api/admin/check-in/scan", {token: code, gate: "T" + run, zone});
  const conf = await db.conference.create({data: {eventId: S.ev.id, title: "AT-077 programme " + run, slug: "at077-" + run, published: true, capacity: 50, feeMinor: 0n}});
  const mk = async (tag, conference) => {
    const c = await customerSignup(`at077-${tag}-${run}@test.local`, "Holder " + tag);
    if (conference) {
      const r = await c.post("/api/customer/registrations", {kind: "CONFERENCE", conferenceId: conf.id, consent: true}); ok(r, 201, "conf " + tag);
      ok(await OPS.post(`/api/admin/registrations/${r.body.id}/review`, {decision: "CONFIRMED", reason: "Free programme confirmed"}), 200, "confirm " + tag);
    } else ok(await c.post("/api/customer/registrations", {kind: "VISITOR", consent: true}), 201, "visitor " + tag);
    const passes = (await c.get("/api/customer/passes")).body.passes;
    const p = passes.find(x => x.entitlement === (conference ? "CONFERENCE" : "EXPO_ENTRY"));
    return {code: p.manualCode, pass: await db.eventPass.findUniqueOrThrow({where: {id: p.passId}})};
  };
  const cases = [];
  const exp = await mk("expired"); await db.eventPass.update({where: {id: exp.pass.id}, data: {expiresAt: new Date(Date.now() - 60000)}}); cases.push([exp, "EXPO_ENTRY", "EXPIRED"]);
  const rev = await mk("revoked"); await db.eventPass.update({where: {id: rev.pass.id}, data: {status: "REVOKED", revokedAt: new Date()}}); cases.push([rev, "EXPO_ENTRY", "REVOKED"]);
  const can = await mk("cancelled"); await db.enrollment.update({where: {id: can.pass.enrollmentId}, data: {status: "CANCELLED"}}); cases.push([can, "EXPO_ENTRY", "REVOKED"]);
  const unpaid = await mk("unpaid", true); await db.enrollment.update({where: {id: unpaid.pass.enrollmentId}, data: {status: "PENDING_REVIEW"}}); cases.push([unpaid, "CONFERENCE", "UNPAID"]);
  for (const [c, zone, want] of cases) {
    const r = await scan(c.code, zone);
    assert.equal(r.body.result, want, want + " → " + JSON.stringify(r.body));
    assert.equal(r.body.admitted, false); assert.equal(r.body.person, undefined, "no identity on rejected scan");
    assert.equal(await db.admission.count({where: {passId: c.pass.id}}), 0, "no admission entry for " + want);
    assert.equal(await db.passScan.count({where: {passId: c.pass.id, result: want}}), 1, "attempt logged");
  }
  const good = await mk("valid"); const g = await scan(good.code); assert.equal(g.body.result, "VALID_ACCEPTED", "control case admitted");
});
