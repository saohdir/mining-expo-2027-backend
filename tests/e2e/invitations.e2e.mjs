// FR-156 exhibitor booth representatives and FR-059 group delegate registration (both behind flags, on in E2E).
import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup, Client, MAIL, qp} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const R = {}, S = {};
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const inviteToken = email => {
  const lines = fs.readFileSync(MAIL, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].to.includes(email)) { const m = qp(lines[i].body).match(/invitation\?token=([A-Za-z0-9_%-]+)/); if (m) return decodeURIComponent(m[1]); }
  throw new Error("no invitation for " + email);
};
const wait = () => new Promise(s => setTimeout(s, 300));
test.after(() => db.$disconnect());

test("FR-156: booth owner invites representatives of a confirmed booking (limit, ownership, flag)", async () => {
  for (const r of ["OPERATIONS", "VIEWER", "SALES"]) R[r] = await adminLogin(r);
  const ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  if (!ev.published) await db.event.update({where: {id: ev.id}, data: {published: true}});
  const plan = await db.floorplan.findFirst({where: {eventId: ev.id}}) ?? await db.floorplan.create({data: {eventId: ev.id, versionNo: 900 + Math.floor(Math.random() * 99), title: "Invite test plan"}});
  S.owner = await customerSignup(`exh-${run}@test.local`, "Booth Owner");
  const me = (await S.owner.get("/api/customer/me")).body;
  S.booth = await db.boothRequest.create({data: {accountId: me.id, eventId: ev.id, floorplanId: plan.id, requestedAreaSqm: 18, preferredUnitIds: [], companySnapshot: {name: "PT Tambang " + run}, status: "UNDER_REVIEW"}});
  const url = "/api/customer/booth-requests/" + S.booth.id + "/staff";
  ok(await S.owner.post(url, {email: `rep1-${run}@test.local`, fullName: "Rep One"}), 409, "not before confirmation");
  await db.boothRequest.update({where: {id: S.booth.id}, data: {status: "CONFIRMED"}});
  const other = await customerSignup(`other-${run}@test.local`, "Not Owner");
  ok(await other.post(url, {email: `rep1-${run}@test.local`, fullName: "Rep One"}), 404, "only the booking owner");
  ok(await S.owner.post(url, {email: `exh-${run}@test.local`, fullName: "Me"}), 409, "self invite");
  ok(await S.owner.post(url, {email: `rep1-${run}@test.local`, fullName: "Rep One"}), 201, "invite 1");
  ok(await S.owner.post(url, {email: `REP1-${run}@test.local`, fullName: "Rep One"}), 409, "duplicate (case-insensitive)");
  const two = await S.owner.post(url, {email: `rep2-${run}@test.local`, fullName: "Rep Two"}); ok(two, 201, "invite 2");
  assert.equal(two.body.used, 2); assert.equal(two.body.limit, 2);
  ok(await S.owner.post(url, {email: `rep3-${run}@test.local`, fullName: "Rep Three"}), 409, "limit reached");
  const base = process.env.E2E_CLOSED_BASE_URL;
  if (base) { const r = await fetch(base + url, {headers: {cookie: [...S.owner.jar].map(([k, v]) => k + "=" + v).join("; ")}}); assert.equal(r.status, 503, "flag off → disabled"); }
  assert.ok((await db.auditLog.count({where: {action: "EXHIBITOR_STAFF_INVITED", resourceId: S.booth.id}})) === 2);
});

test("FR-156: representative accepts with own account (email must match), gets expo pass; removal revokes it", async () => {
  await wait();
  const token = inviteToken(`rep1-${run}@test.local`);
  const pv = await new Client("anon").get("/api/public/invitations?token=" + encodeURIComponent(token)); ok(pv, 200, "preview");
  assert.equal(pv.body.company, "PT Tambang " + run); assert.ok(!pv.body.email.startsWith("rep1"), "email masked");
  ok(await new Client("anon").get("/api/public/invitations?token=" + "x".repeat(43)), 404, "unknown token");
  ok(await new Client("anon").post("/api/customer/invitations/accept", {token}), 401, "login required");
  const wrong = await customerSignup(`wrong-${run}@test.local`, "Wrong Person");
  ok(await wrong.post("/api/customer/invitations/accept", {token}), 403, "forwarded link rejected");
  S.rep = await customerSignup(`rep1-${run}@test.local`, "Rep One");
  const acc = await S.rep.post("/api/customer/invitations/accept", {token}); ok(acc, 200, "accept");
  ok(await S.rep.post("/api/customer/invitations/accept", {token}), 409, "single use");
  const passes = (await S.rep.get("/api/customer/passes")).body.passes;
  assert.deepEqual(passes.map(p => p.entitlement), ["EXPO_ENTRY"], "individual expo pass");
  const list = (await S.owner.get("/api/customer/booth-requests/" + S.booth.id + "/staff")).body.staff;
  const inv = list.find(s => s.email === `rep1-${run}@test.local`); assert.equal(inv.status, "ACCEPTED");
  ok(await R.VIEWER.get("/api/admin/invitations?boothRequestId=" + S.booth.id), 200, "admin overview");
  ok(await S.owner.del("/api/customer/booth-requests/" + S.booth.id + "/staff/" + inv.id), 200, "remove");
  const active = await db.eventPass.count({where: {account: {email: `rep1-${run}@test.local`}, status: "ACTIVE"}});
  assert.equal(active, 0, "pass revoked on removal");
});

test("FR-059: coordinator registers delegates; seats on acceptance; group review confirms with individual passes", async () => {
  const ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  S.conf = await db.conference.create({data: {eventId: ev.id, title: "Group programme " + run, slug: "grp-" + run, published: true, capacity: 3, feeMinor: 1000000n}});
  S.coord = await customerSignup(`coord-${run}@test.local`, "Group Coordinator");
  const d = n => ({email: `del${n}-${run}@test.local`, fullName: "Delegate " + n});
  ok(await S.coord.post("/api/customer/group-registrations", {conferenceId: S.conf.id, delegates: [d(1), d(2), d(3), d(4)], consent: true}), 409, "more delegates than seats");
  ok(await S.coord.post("/api/customer/group-registrations", {conferenceId: S.conf.id, delegates: [d(1), d(1)], consent: true}), 400, "duplicate emails");
  const g = await S.coord.post("/api/customer/group-registrations", {conferenceId: S.conf.id, delegates: [d(1), d(2), d(3)], consent: true}); ok(g, 201, "group");
  S.groupId = g.body.groupId;
  assert.equal(g.body.groups[0].delegates.length, 3);
  await wait();
  const dels = [];
  for (const n of [1, 2]) { const c = await customerSignup(`del${n}-${run}@test.local`, "Delegate " + n); ok(await c.post("/api/customer/invitations/accept", {token: inviteToken(`del${n}-${run}@test.local`)}), 200, "accept " + n); dels.push(c); }
  // Seat taken by an individual booking before delegate 3 accepts → capacity enforced at acceptance.
  const solo = await customerSignup(`solo-${run}@test.local`, "Solo");
  ok(await solo.post("/api/customer/registrations", {kind: "CONFERENCE", conferenceId: S.conf.id, consent: true}), 201, "solo");
  const late = await customerSignup(`del3-${run}@test.local`, "Delegate 3");
  ok(await late.post("/api/customer/invitations/accept", {token: inviteToken(`del3-${run}@test.local`)}), 409, "full at acceptance");
  const ad = (await R.VIEWER.get("/api/admin/groups")).body.groups.find(x => x.groupId === S.groupId);
  assert.equal(ad.counts.SUBMITTED, 2); assert.equal(ad.coordinator.email, `coord-${run}@test.local`);
  ok(await R.SALES.post("/api/admin/groups/" + S.groupId + "/review", {decision: "CONFIRMED", reason: "sales attempt"}), 403, "RBAC");
  const rv = await R.OPERATIONS.post("/api/admin/groups/" + S.groupId + "/review", {decision: "CONFIRMED", reason: "Invoice INV-GRP paid in full"}); ok(rv, 200, "confirm group");
  assert.equal(rv.body.reviewed, 2);
  for (const c of dels) assert.ok((await c.get("/api/customer/passes")).body.passes.some(p => p.entitlement === "CONFERENCE"), "own conference pass");
  ok(await R.OPERATIONS.post("/api/admin/groups/" + S.groupId + "/review", {decision: "CONFIRMED", reason: "Invoice INV-GRP paid in full"}), 409, "nothing left");
  const inv3 = (await S.coord.get("/api/customer/group-registrations")).body.groups[0].delegates.find(x => x.email === `del3-${run}@test.local`);
  ok(await S.coord.del("/api/customer/group-registrations/" + S.groupId, {invitationId: inv3.id}), 200, "withdraw open invitation");
  const inv1 = (await S.coord.get("/api/customer/group-registrations")).body.groups[0].delegates.find(x => x.email === `del1-${run}@test.local`);
  ok(await S.coord.del("/api/customer/group-registrations/" + S.groupId, {invitationId: inv1.id}), 409, "confirmed delegate only via organizer");
});
