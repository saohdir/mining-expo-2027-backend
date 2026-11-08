// PRD v1.4 Slice F: proof upload (AT-064), maker-checker (FR-132), reversal (AT-087),
// cancel after DP + pass revocation + refund (AT-069), delivery history (AT-063).
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup, BASE} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const R = {}, S = {};
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const pay = (amount, ref, extra = {}) => ({amountMinor: amount, bankReference: ref, transferredAt: new Date().toISOString(), bankVerified: true, reason: "E2E bank statement matched", ...extra});
test.after(() => db.$disconnect());

async function paidConference(c, fee) {
  const ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  const conf = await db.conference.create({data: {eventId: ev.id, title: "Paid " + run + fee, slug: "paid-" + run + "-" + fee, published: true, feeMinor: BigInt(fee), capacity: 50}});
  const r = await c.post("/api/customer/registrations", {kind: "CONFERENCE", conferenceId: conf.id, consent: true});
  ok(r, 201, "paid conference registration");
  return r.body.id;
}
async function issuedInvoice(c, enrollmentId, total) {
  const me = (await c.get("/api/customer/me")).body;
  const d = await R.FINANCE.post("/api/admin/invoices", {accountId: me.id, enrollmentId, items: [{description: "Conference seat", quantity: 1, unitPriceMinor: String(total)}], minimumDpMinor: "1000000"});
  ok(d, 201, "draft");
  ok(await R.FINANCE.post(`/api/admin/invoices/${d.body.id}/issue`, {}), 200, "issue");
  return d.body.id;
}
const invoiceOf = async (c, id) => (await c.get("/api/customer/invoices")).body.invoices.find(i => i.id === id);

test("setup", async () => {
  for (const role of ["SUPER_ADMIN", "FINANCE", "SALES", "OPERATIONS"]) R[role] = await adminLogin(role);
  R.FINANCE2 = await adminLogin("FINANCE", "finance2");
  ok(await R.SUPER_ADMIN.patch("/api/admin/events", {published: true, visitorOpen: true, reason: "E2E finance controls"}), 200, "event");
  S.cust = await customerSignup(`fin-${run}@test.local`, "Finance Buyer");
  S.enrollment = await paidConference(S.cust, 100000000);
  S.invoice = await issuedInvoice(S.cust, S.enrollment, 100000000);
});

test("AT-063: email + WhatsApp sharing recorded as delivery history", async () => {
  const e = await R.SALES.post(`/api/admin/invoices/${S.invoice}/send`, {channel: "EMAIL", reason: "E2E send invoice"});
  ok(e, 200, "email");
  const l = await R.FINANCE.get(`/api/admin/invoices/${S.invoice}/ledger`);
  ok(l, 200, "ledger");
  assert.equal(l.body.deliveries[0].channel, "EMAIL");
  assert.match(l.body.deliveries[0].destinationMasked, /\*\*\*@test\.local/);
  ok(await R.SALES.post(`/api/admin/invoices/${S.invoice}/send`, {channel: "WHATSAPP", reason: "E2E whatsapp"}), 409, "no verified phone → 409");
});

test("AT-064: customer proof is PENDING only; invoice stays unpaid; Finance verifies against it", async () => {
  const fd = new FormData();
  fd.append("amountMinor", "2000000"); fd.append("bankReference", "PROOF-" + run); fd.append("transferredAt", new Date().toISOString());
  fd.append("file", new Blob([Buffer.from("%PDF-1.4 test proof")], {type: "application/pdf"}), "proof.pdf");
  const up = await fetch(`${BASE}/api/customer/invoices/${S.invoice}/payment-proof`, {method: "POST", body: fd, headers: {origin: BASE, cookie: [...S.cust.jar].map(([k, v]) => k + "=" + v).join("; ")}});
  assert.equal(up.status, 201, "proof upload " + up.status);
  const proofId = (await up.json()).id;
  let inv = await invoiceOf(S.cust, S.invoice);
  assert.equal(inv.state, "AWAITING_PAYMENT", "proof ≠ paid");
  assert.equal(inv.proofs[0].status, "PENDING_VERIFICATION");
  const bad = new FormData();
  bad.append("amountMinor", "1"); bad.append("bankReference", "EXE-" + run); bad.append("transferredAt", new Date().toISOString());
  bad.append("file", new Blob([Buffer.from("MZ executable")], {type: "application/pdf"}), "x.pdf");
  const r2 = await fetch(`${BASE}/api/customer/invoices/${S.invoice}/payment-proof`, {method: "POST", body: bad, headers: {origin: BASE, cookie: [...S.cust.jar].map(([k, v]) => k + "=" + v).join("; ")}});
  assert.equal(r2.status, 415, "spoofed file type refused");
  ok(await R.SALES.get(`/api/admin/manual-transfers/${proofId}/proof`), 403, "sales cannot view proof");
  const view = await fetch(`${BASE}/api/admin/manual-transfers/${proofId}/proof`, {headers: {cookie: [...R.FINANCE.jar].map(([k, v]) => k + "=" + v).join("; ")}});
  assert.equal(view.status, 200); assert.match(Buffer.from(await view.arrayBuffer()).toString(), /%PDF/);
  const v = await R.FINANCE.post(`/api/admin/invoices/${S.invoice}/verify-transfer`, pay("2000000", "PROOF-" + run, {proofTransferId: proofId}));
  ok(v, 200, "verify from proof");
  inv = await invoiceOf(S.cust, S.invoice);
  assert.equal(inv.state, "DP_RECEIVED"); assert.equal(inv.paidMinor, "2000000"); assert.equal(inv.proofs[0].status, "VERIFIED");
});

test("FR-132: high-value receipt needs a different approver (threshold 50,000,000)", async () => {
  const sub = await R.FINANCE.post(`/api/admin/invoices/${S.invoice}/verify-transfer`, pay("98000000", "BIG-" + run));
  ok(sub, 202, "submitted for approval");
  assert.equal((await invoiceOf(S.cust, S.invoice)).state, "DP_RECEIVED", "pending approval not counted");
  ok(await R.FINANCE.post(`/api/admin/manual-transfers/${sub.body.transferId}/approve`, {reason: "self approval attempt"}), 403, "maker cannot approve");
  ok(await R.SALES.post(`/api/admin/manual-transfers/${sub.body.transferId}/approve`, {reason: "sales approval attempt"}), 403, "sales cannot approve");
  ok(await R.FINANCE2.post(`/api/admin/manual-transfers/${sub.body.transferId}/approve`, {reason: "second finance approver"}), 200, "checker approves");
  const inv = await invoiceOf(S.cust, S.invoice);
  assert.equal(inv.state, "PAID_IN_FULL");
});

test("AT-087: reversal appends a correction, recomputes balance, keeps original", async () => {
  const l = (await R.FINANCE.get(`/api/admin/invoices/${S.invoice}/ledger`)).body;
  const receipt = l.receipts.find(r => r.status === "VERIFIED" && r.amountMinor === "98000000");
  ok(await R.SALES.post(`/api/admin/invoices/${S.invoice}/adjustments`, {type: "REVERSAL", transferId: receipt.id, amountMinor: "1000000", reason: "sales reversal attempt"}), 403, "sales cannot reverse");
  ok(await R.FINANCE.post(`/api/admin/invoices/${S.invoice}/adjustments`, {type: "REVERSAL", transferId: receipt.id, amountMinor: "99000000", reason: "too large reversal"}), 409, "over-reversal");
  ok(await R.FINANCE.post(`/api/admin/invoices/${S.invoice}/adjustments`, {type: "REVERSAL", transferId: receipt.id, amountMinor: "1000000", reason: "Misposted 1,000,000 belongs to another payer"}), 201, "reversal");
  const inv = await invoiceOf(S.cust, S.invoice);
  assert.equal(inv.state, "DP_RECEIVED"); assert.equal(inv.paidMinor, "99000000"); assert.equal(inv.outstandingMinor, "1000000");
  assert.equal(await db.manualTransfer.count({where: {invoiceId: S.invoice, status: "VERIFIED"}}), 2, "original receipts preserved");
  assert.ok(inv.ledger.some(x => x.kind === "REVERSAL"));
  assert.equal((await db.invoice.findUnique({where: {id: S.invoice}})).status, "PARTIALLY_PAID");
});

test("AT-069: cancel after DP → CANCELLED/refund pending, pass revoked, refund recorded separately", async () => {
  await db.enrollment.update({where: {id: S.enrollment}, data: {status: "CONFIRMED"}});
  const pass = await db.eventPass.create({data: {accountId: (await S.cust.get("/api/customer/me")).body.id, enrollmentId: S.enrollment,
    eventId: (await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}})).id, tokenHash: "e2e-" + run, expiresAt: new Date(Date.now() + 864e5)}});
  ok(await R.SALES.post(`/api/admin/invoices/${S.invoice}/cancel`, {reason: "sales cancel attempt", cancelBooking: true}), 403, "sales cancel");
  const c = await R.FINANCE.post(`/api/admin/invoices/${S.invoice}/cancel`, {reason: "Customer withdrew after DP", cancelBooking: true});
  ok(c, 200, "cancel");
  assert.equal(c.body.customerState, "REFUND_PENDING");
  assert.equal((await db.eventPass.findUnique({where: {id: pass.id}})).status, "REVOKED", "pass revoked");
  assert.equal((await db.enrollment.findUnique({where: {id: S.enrollment}})).status, "CANCELLED");
  let inv = await invoiceOf(S.cust, S.invoice);
  assert.equal(inv.state, "REFUND_PENDING"); assert.equal(inv.bankDetails, null, "no transfer instructions after cancel");
  ok(await R.FINANCE.post(`/api/admin/invoices/${S.invoice}/verify-transfer`, pay("100", "LATE-" + run)), 409, "cancelled invoice not payable");
  ok(await R.FINANCE.post(`/api/admin/invoices/${S.invoice}/adjustments`, {type: "REFUND", amountMinor: "99000001", reason: "refund too large", payoutReference: "OUT-1", bankVerified: true}), 409, "refund > paid");
  ok(await R.FINANCE.post(`/api/admin/invoices/${S.invoice}/adjustments`, {type: "REFUND", amountMinor: "99000000", reason: "Refund executed per approved policy", payoutReference: "OUT-" + run, bankVerified: true}), 201, "refund");
  inv = await invoiceOf(S.cust, S.invoice);
  assert.equal(inv.state, "REFUNDED");
  const audit = await db.auditLog.findMany({where: {resourceId: S.invoice}, select: {action: true}});
  for (const a of ["INVOICE_CANCELLED", "PAYMENT_REVERSAL", "PAYMENT_REFUND"]) assert.ok(audit.some(x => x.action === a), "audit " + a);
});
