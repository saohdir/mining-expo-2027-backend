// FR-154 scheduled mailouts (maker-checker, worker send) + attendance reconciliation; FR-059 group discount line.
import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup, MAIL, qp} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const R = {}, S = {};
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const mails = to => fs.readFileSync(MAIL, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l)).filter(m => m.to.includes(to)).map(m => qp(m.body));
test.after(async () => { if (S.ev) await db.event.update({where: {id: S.ev.id}, data: {startsAt: S.ev.startsAt, published: S.ev.published, visitorOpen: S.ev.visitorOpen}}); await db.$disconnect(); });

test("FR-154 mailout: draft → second-person approval → worker delivers to confirmed participants only", {timeout: 60000}, async () => {
  for (const r of ["SUPER_ADMIN", "OPERATIONS", "SALES", "VIEWER"]) R[r] = await adminLogin(r);
  S.ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  await db.event.update({where: {id: S.ev.id}, data: {published: true, visitorOpen: true, startsAt: new Date(Date.now() - 3600000)}});
  S.visitor = await customerSignup(`mo-${run}@test.local`, "Mailout Visitor");
  ok(await S.visitor.post("/api/customer/registrations", {kind: "VISITOR", consent: true}), 201, "visitor");
  await customerSignup(`mo-none-${run}@test.local`, "No Registration");
  const body = {subject: "Venue update " + run, body: "Hall B opens at 09:00 WIB. Bring your QR pass.", segment: "VISITORS", sendAt: new Date(Date.now() + 3600000).toISOString()};
  ok(await R.VIEWER.post("/api/admin/mailouts", body), 403, "viewer cannot draft");
  ok(await R.SALES.post("/api/admin/mailouts", {...body, sendAt: new Date(Date.now() - 1000).toISOString()}), 400, "past send time");
  const d = await R.SALES.post("/api/admin/mailouts", body); ok(d, 201, "draft"); assert.ok(d.body.mailout.recipients >= 1);
  ok(await R.SALES.post(`/api/admin/mailouts/${d.body.mailout.id}/approve`, {reason: "Self approval attempt"}), 403, "sales cannot approve");
  const self = await adminLogin("OPERATIONS");
  const own = await self.post("/api/admin/mailouts", body); ok(own, 201, "ops draft");
  ok(await self.post(`/api/admin/mailouts/${own.body.mailout.id}/approve`, {reason: "Approving my own"}), 409, "author cannot approve");
  ok(await R.SUPER_ADMIN.post(`/api/admin/mailouts/${own.body.mailout.id}/cancel`, {reason: "Duplicate of sales draft"}), 200, "cancel");
  ok(await R.OPERATIONS.post(`/api/admin/mailouts/${d.body.mailout.id}/approve`, {reason: "Checked wording and segment"}), 200, "approve");
  await db.mailout.update({where: {id: d.body.mailout.id}, data: {sendAt: new Date(Date.now() - 1000)}});
  for (let i = 0; i < 40 && !mails(`mo-${run}@test.local`).some(b => b.includes("Hall B opens")); i++) await new Promise(s => setTimeout(s, 500));
  assert.ok(mails(`mo-${run}@test.local`).some(b => b.includes("Hall B opens") && b.includes("registered for IMDX 2027")), "delivered with service footer");
  assert.equal(mails(`mo-none-${run}@test.local`).some(b => b.includes("Hall B opens")), false, "not sent to unregistered accounts");
  assert.equal((await db.mailout.findUnique({where: {id: d.body.mailout.id}})).status, "SENT");
});

test("FR-154 reconciliation: expected vs arrived from upload; RBAC; CSV", async () => {
  const code = (await S.visitor.get("/api/customer/passes")).body.passes[0].manualCode;
  ok(await R.OPERATIONS.post("/api/admin/gates", {code: "RC" + run, name: "Recon gate", zones: ["EXPO_ENTRY"]}), 201, "gate");
  assert.equal((await R.SUPER_ADMIN.post("/api/admin/check-in/scan", {token: code, gate: "RC" + run, zone: "EXPO_ENTRY"})).body.result, "VALID_ACCEPTED");
  const csv = `email,name\nmo-${run}@test.local,Mailout Visitor\nghost-${run}@test.local,Ghost\n`;
  ok(await R.SALES.post("/api/admin/reports/reconciliation", {csv}), 403, "sales cannot reconcile");
  const r = await R.OPERATIONS.post("/api/admin/reports/reconciliation", {csv}); ok(r, 200, "run");
  const st = e => r.body.rows.find(x => x.email === e)?.status;
  assert.equal(st(`mo-${run}@test.local`), "EXPECTED_ARRIVED"); assert.equal(st(`ghost-${run}@test.local`), "EXPECTED_NOT_ARRIVED");
  const c = await R.OPERATIONS.post("/api/admin/reports/reconciliation", {csv, format: "csv"});
  assert.equal(c.status, 200); assert.match(String(c.body), /^status,email,name/);
  ok(await R.OPERATIONS.post("/api/admin/reports/reconciliation", {csv: "name\nx"}), 400, "email column required");
});

test("FR-059 group discount: configured tier adds a DISCOUNT line and VAT on the discounted base", async () => {
  const FIN = await adminLogin("FINANCE");
  const conf = await db.conference.create({data: {eventId: S.ev.id, title: "Discount programme " + run, slug: "disc-" + run, published: true, capacity: 20, feeMinor: 1000000n}});
  const groupId = "00000000-0000-4000-8000-" + Date.now().toString().slice(-12).padStart(12, "0");
  const people = [];
  for (const n of [1, 2]) { const c = await customerSignup(`gd${n}-${run}@test.local`, "Group Delegate " + n); const me = (await c.get("/api/customer/me")).body;
    people.push(await db.enrollment.create({data: {accountId: me.id, eventId: S.ev.id, conferenceId: conf.id, type: "CONFERENCE", status: "SUBMITTED", groupId, profileSnapshot: {fullName: "Group Delegate " + n}, consentAt: new Date()}})); }
  try {
    ok(await R.SUPER_ADMIN.req("PUT", "/api/admin/invoice-charges", {config: {approvedBy: "E2E Finance", approvedAt: "2026-11-01", charges: [{code: "VAT", label: "VAT", kind: "TAX", rateBps: 1100, appliesTo: ["CONFERENCE"]}], groupDiscounts: [{minDelegates: 2, rateBps: 1000}]}, reason: "Group discount test config"}), 200, "config");
    const inv = await FIN.post("/api/admin/invoices", {accountId: people[0].accountId, enrollmentId: people[0].id, items: [{description: "Conference seat", quantity: 1, unitPriceMinor: "1000000"}]});
    ok(inv, 201, "draft"); assert.equal(inv.body.totalMinor, "999000", "1,000,000 − 10% + 11% VAT on 900,000");
    const lines = await db.invoiceItem.findMany({where: {invoiceId: inv.body.id}});
    assert.deepEqual(lines.map(l => [l.kind, l.amountMinor.toString()]).sort(), [["DISCOUNT", "-100000"], ["ITEM", "1000000"], ["TAX", "99000"]]);
  } finally { await R.SUPER_ADMIN.req("PUT", "/api/admin/invoice-charges", {config: null, reason: "Cleanup after discount test"}); }
});
