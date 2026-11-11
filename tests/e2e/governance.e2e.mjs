// FR-115 OTP switches, FR-050 receipt, FR-125 invoice revision, FR-150 data requests, FR-037 assets,
// FR-133 schedule-change alerts, FR-042 admission mode, FR-060 booth route.
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup, Client, BASE} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const R = {}, S = {};
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const cookie = c => [...c.jar].map(([k, v]) => k + "=" + v).join("; ");
test.after(() => db.$disconnect());

test("setup", async () => {
  for (const r of ["SUPER_ADMIN", "FINANCE", "OPERATIONS", "CONTENT_EDITOR", "SALES"]) R[r] = await adminLogin(r);
  ok(await R.SUPER_ADMIN.patch("/api/admin/events", {published: true, visitorOpen: true, reason: "E2E governance"}), 200, "event");
  S.cust = await customerSignup(`gov-${run}@test.local`, "Gov Customer");
});

test("FR-115 Super Admin can switch email OTP off (immediate 503) and back on", async () => {
  ok(await R.FINANCE.req("PATCH", "/api/admin/settings", {channel: "email", enabled: false, reason: "finance attempt"}), 403, "finance");
  ok(await R.SUPER_ADMIN.req("PATCH", "/api/admin/settings", {channel: "email", enabled: false, reason: "Provider outage drill"}), 200, "off");
  const reg = e => new Client("x").post("/api/auth/register/start", {fullName: "Switch Test", email: e, acceptTerms: true, acceptPrivacy: true});
  ok(await reg(`sw1-${run}@test.local`), 503, "registration email OTP disabled");
  ok(await new Client("y").post("/api/auth/login", {email: `gov-${run}@test.local`, password: "Tambang2027x"}), 200, "password login unaffected by OTP switch");
  assert.equal((await new Client("x").get("/api/public/capabilities")).body.emailOtp, false);
  ok(await R.SUPER_ADMIN.req("PATCH", "/api/admin/settings", {channel: "email", enabled: true, reason: "Provider restored"}), 200, "on");
  ok(await reg(`sw2-${run}@test.local`), 200, "registration OTP back");
});

test("FR-042/133 admission mode exposed; schedule change alerts every active booking", async () => {
  const ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  const conf = await db.conference.create({data: {eventId: ev.id, title: "Gov " + run, slug: "gov-" + run, published: true, feeMinor: 0n, capacity: 10, startsAt: new Date("2027-05-26T02:00:00Z")}});
  const e = (await new Client("a").get("/api/public/events")).body.events[0].conferences.find(c => c.id === conf.id);
  assert.equal(e.admissionMode, "FREE");
  const reg = await S.cust.post("/api/customer/registrations", {kind: "CONFERENCE", conferenceId: conf.id, consent: true}); ok(reg, 201, "reg");
  ok(await R.OPERATIONS.patch("/api/admin/conferences/" + conf.id, {startsAt: "2027-05-27T03:00:00.000Z", reason: "Speaker rescheduled to day two"}), 200, "reschedule");
  assert.equal(await db.notificationOutbox.count({where: {topic: "CONFERENCE_CHANGED", payload: {path: ["enrollmentId"], equals: reg.body.id}}}), 1, "customer alerted");
  assert.equal((await db.enrollment.findUnique({where: {id: reg.body.id}})).profileSnapshot.fullName, "Gov Customer", "snapshot retained");
  S.conf = conf; S.reg = reg.body.id;
});

test("FR-125 revision voids the issued invoice and creates a linked draft; FR-050 receipt only after verification", async () => {
  const ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  const paid = await db.conference.create({data: {eventId: ev.id, title: "Paid gov " + run, slug: "paidgov-" + run, published: true, feeMinor: 3000000n, capacity: 10}});
  const reg = await S.cust.post("/api/customer/registrations", {kind: "CONFERENCE", conferenceId: paid.id, consent: true}); ok(reg, 201, "paid reg");
  const accountId = (await S.cust.get("/api/customer/me")).body.id;
  const d = await R.FINANCE.post("/api/admin/invoices", {accountId, enrollmentId: reg.body.id, items: [{description: "Seat", quantity: 1, unitPriceMinor: "3000000"}]}); ok(d, 201, "draft");
  ok(await R.FINANCE.post(`/api/admin/invoices/${d.body.id}/issue`, {}), 200, "issue");
  ok(await R.SALES.post(`/api/admin/invoices/${d.body.id}/revise`, {reason: "sales revise attempt"}), 403, "sales revise");
  const rv = await R.FINANCE.post(`/api/admin/invoices/${d.body.id}/revise`, {reason: "Corrected seat description", items: [{description: "Conference seat (corrected)", quantity: 1, unitPriceMinor: "3000000"}]});
  ok(rv, 201, "revise");
  assert.equal((await db.invoice.findUnique({where: {id: d.body.id}})).status, "VOID");
  assert.equal((await db.invoice.findUnique({where: {id: rv.body.draftId}})).revisionOfId, d.body.id);
  ok(await R.FINANCE.post(`/api/admin/invoices/${rv.body.draftId}/issue`, {}), 200, "issue revised");
  const receipt = () => fetch(`${BASE}/api/customer/invoices/${rv.body.draftId}/receipt`, {headers: {cookie: cookie(S.cust)}});
  assert.equal((await receipt()).status, 409, "no receipt before verification");
  ok(await R.FINANCE.post(`/api/admin/invoices/${rv.body.draftId}/verify-transfer`, {amountMinor: "1000000", bankReference: "GOV-" + run, transferredAt: new Date().toISOString(), bankVerified: true, reason: "E2E bank statement matched"}), 200, "DP");
  const r = await receipt(); assert.equal(r.status, 200); assert.match(Buffer.from(await r.arrayBuffer()).subarray(0, 5).toString(), /%PDF/);
  ok(await R.FINANCE.post(`/api/admin/invoices/${rv.body.draftId}/revise`, {reason: "attempt after payment"}), 409, "cannot revise after payment");
});

test("FR-150 data request intake and Super Admin resolution", async () => {
  ok(await S.cust.post("/api/customer/data-request", {kind: "ERASE_EVERYTHING", details: "x"}), 400, "bad kind");
  const r = await S.cust.post("/api/customer/data-request", {kind: "ACCESS", details: "Please send me a copy of my data"}); ok(r, 201, "request"); assert.match(r.body.reference, /^IMDX-DR-/);
  ok(await R.OPERATIONS.get("/api/admin/data-requests"), 403, "ops cannot see");
  ok(await R.SUPER_ADMIN.patch("/api/admin/data-requests/" + r.body.id, {status: "COMPLETED", reason: "Export sent via secure channel"}), 200, "resolve");
  assert.equal((await S.cust.get("/api/customer/data-request")).body.requests[0].status, "COMPLETED");
});

test("FR-037 asset upload: alt + rights can follow later, re-encoded to WebP, served publicly", async () => {
  const sharp = (await import("sharp")).default;
  const png = await sharp({create: {width: 30, height: 20, channels: 3, background: "#c33"}}).png().toBuffer();
  const up = async (fields, c = R.CONTENT_EDITOR) => { const fd = new FormData(); fd.append("file", new Blob([png], {type: "image/png"}), "logo.png"); for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    const r = await fetch(`${BASE}/api/admin/assets`, {method: "POST", body: fd, headers: {origin: BASE, cookie: cookie(c)}}); return {status: r.status, body: await r.json()}; };
  // Alt text and rights are checked when the item is published, not at upload (uploads used to fail silently).
  ok(await up({}), 201, "upload without alt/rights");
  ok(await up({altText: "x"}), 201, "short alt is ignored at upload");
  ok(await up({altText: "PT X logo", rightsStatus: "LICENSED"}, R.SALES), 403, "sales");
  const good = await up({altText: "PT X logo", rightsStatus: "LICENSED"}); ok(good, 201, "upload");
  const m = await fetch(BASE + good.body.url); assert.equal(m.status, 200); assert.equal(m.headers.get("content-type"), "image/webp");
});

test("FR-060 dedicated booth request route keeps the selected unit", async () => {
  const r = await fetch(`${BASE}/account/booth?unit=11111111-2222-3333-4444-555555555555`, {redirect: "manual"});
  assert.ok([303, 307, 308].includes(r.status)); assert.match(r.headers.get("location"), /\/account\?request=11111111-2222-3333-4444-555555555555#booth/);
});
