// PRD v1.4 Slice B/C: OTP security & anti-enumeration (AT-059/061), return URL (AT-057),
// contact change (AT-086), manual payment request (AT-062), conference entitlement (AT-066), one account (AT-058).
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup, customerLogin, Client, lastOtp} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const R = {}, S = {};
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const wait = ms => new Promise(r => setTimeout(r, ms));
test.after(() => db.$disconnect());

test("setup", async () => {
  for (const r of ["SUPER_ADMIN", "FINANCE", "OPERATIONS"]) R[r] = await adminLogin(r);
  ok(await R.SUPER_ADMIN.patch("/api/admin/events", {published: true, visitorOpen: true, reason: "E2E auth account"}), 200, "event");
  S.email = `acct-${run}@test.local`;
  S.cust = await customerSignup(S.email, "Account Owner");
});

// Registration/login/reset security now lives in customer-password-auth.e2e.mjs (CR-AUTH-01).

test("AT-086: contact change needs recent auth + OTP to new email; other sessions revoked; old address alerted", async () => {
  const other = await customerLogin(S.email); // second device signs in with password
  ok(await S.cust.post("/api/customer/contact-change", {channel: "EMAIL", value: `nobody-${run}@test.local`.replace("nobody", "taken")}), 200, "untaken ok");
  const takenEmail = `reg-taken-${run}@test.local`;
  await customerSignup(takenEmail, "Taken");
  ok(await S.cust.post("/api/customer/contact-change", {channel: "EMAIL", value: takenEmail}), 409, "taken contact");
  const sess = await db.customerSession.findFirst({where: {account: {email: S.email}}, orderBy: {createdAt: "asc"}});
  const oldCreated = sess.createdAt;
  await db.customerSession.update({where: {id: sess.id}, data: {createdAt: new Date(Date.now() - 3600000)}});
  ok(await S.cust.post("/api/customer/contact-change", {channel: "EMAIL", value: `new-${run}@test.local`}), 401, "stale session needs re-auth");
  await db.customerSession.update({where: {id: sess.id}, data: {createdAt: oldCreated}});
  const newEmail = `new-${run}@test.local`;
  const c = await S.cust.post("/api/customer/contact-change", {channel: "EMAIL", value: newEmail});
  ok(c, 200, "request change");
  await wait(300);
  ok(await S.cust.post("/api/customer/contact-change/verify", {challengeId: c.body.challengeId, code: "000000"}), 400, "wrong code");
  const v = await S.cust.post("/api/customer/contact-change/verify", {challengeId: c.body.challengeId, code: lastOtp(newEmail)});
  ok(v, 200, "verified"); assert.ok(v.body.otherSessionsRevoked >= 1);
  ok(await other.get("/api/customer/me"), 401, "other device signed out");
  assert.equal((await S.cust.get("/api/customer/me")).body.email, newEmail);
  assert.equal(await db.notificationOutbox.count({where: {topic: "CONTACT_CHANGED", dedupeKey: "contact-changed:" + c.body.challengeId}}), 1, "old address alert queued");
  ok(await S.cust.post("/api/auth/register/verify", {challengeId: c.body.challengeId, code: "000000"}), 400, "contact-change challenge cannot complete a registration");
  S.email = newEmail;
});

test("AT-062/066/058: one account, visitor + paid conference; manual payment request; full payment confirms access; reversal suspends it", async () => {
  ok(await S.cust.post("/api/customer/registrations", {kind: "VISITOR", consent: true}), 201, "visitor");
  const ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  const conf = await db.conference.create({data: {eventId: ev.id, title: "Paid " + run, slug: "acct-" + run, published: true, feeMinor: 2500000n, capacity: 10}});
  const reg = await S.cust.post("/api/customer/registrations", {kind: "CONFERENCE", conferenceId: conf.id, consent: true});
  ok(reg, 201, "conference");
  const mpr = await S.cust.post("/api/customer/manual-payment-request", {enrollmentId: reg.body.id});
  assert.ok([200, 201].includes(mpr.status), "manual payment request " + mpr.status + JSON.stringify(mpr.body));
  assert.ok(await db.manualPaymentRequest.count({where: {enrollmentId: reg.body.id}}) === 1, "request persisted");
  assert.ok(await db.notificationOutbox.count({where: {topic: "MANUAL_PAYMENT_REQUEST"}}) >= 1, "staff email queued via outbox");
  const dup = await S.cust.post("/api/customer/manual-payment-request", {enrollmentId: reg.body.id});
  assert.ok(dup.status < 500, "duplicate request handled");
  assert.equal(await db.manualPaymentRequest.count({where: {enrollmentId: reg.body.id}}), 1, "idempotent");
  const passesBefore = (await S.cust.get("/api/customer/passes")).body.passes.map(p => p.entitlement);
  assert.deepEqual(passesBefore, ["EXPO_ENTRY"], "no conference pass while unpaid");
  const me = (await S.cust.get("/api/customer/me")).body;
  const d = await R.FINANCE.post("/api/admin/invoices", {accountId: me.id, enrollmentId: reg.body.id, items: [{description: "Seat", quantity: 1, unitPriceMinor: "2500000"}]});
  ok(d, 201, "draft"); ok(await R.FINANCE.post(`/api/admin/invoices/${d.body.id}/issue`, {}), 200, "issue");
  const pay = (a, ref) => ({amountMinor: a, bankReference: ref, transferredAt: new Date().toISOString(), bankVerified: true, reason: "E2E bank statement matched"});
  ok(await R.FINANCE.post(`/api/admin/invoices/${d.body.id}/verify-transfer`, pay("1000000", "ACC-DP-" + run)), 200, "DP");
  assert.equal((await db.enrollment.findUnique({where: {id: reg.body.id}})).status, "SUBMITTED", "DP does not confirm conference");
  const full = await R.FINANCE.post(`/api/admin/invoices/${d.body.id}/verify-transfer`, pay("1500000", "ACC-FULL-" + run));
  ok(full, 200, "full");
  assert.equal((await db.enrollment.findUnique({where: {id: reg.body.id}})).status, "CONFIRMED", "full payment confirms");
  const ents = (await S.cust.get("/api/customer/passes")).body.passes.map(p => p.entitlement).sort();
  assert.deepEqual(ents, ["CONFERENCE", "EXPO_ENTRY"], "conference pass issued; expo pass not duplicated");
  ok(await R.FINANCE.post(`/api/admin/invoices/${d.body.id}/adjustments`, {type: "REVERSAL", transferId: full.body.transferId, amountMinor: "1500000", reason: "Bank returned the transfer"}), 201, "reversal");
  assert.equal((await db.enrollment.findUnique({where: {id: reg.body.id}})).status, "PENDING_REVIEW", "access suspended");
  assert.deepEqual((await S.cust.get("/api/customer/passes")).body.passes.map(p => p.entitlement), ["EXPO_ENTRY"], "conference pass revoked");
  const types = (await S.cust.get("/api/customer/me")).body.enrollments.map(e => e.type).sort();
  assert.deepEqual(types, ["CONFERENCE", "VISITOR"], "one account holds several enrollment types");
  const tl = (await S.cust.get("/api/customer/timeline")).body.events.map(e => e.label);
  for (const l of ["Account verified", "Contact details changed", "Payment verified by Finance", "Payment record corrected"]) assert.ok(tl.includes(l), "timeline " + l);
  assert.ok(!JSON.stringify((await S.cust.get("/api/customer/timeline")).body).match(/adminId|reason|@test\.local/), "timeline hides staff ids, reasons, emails");
});
