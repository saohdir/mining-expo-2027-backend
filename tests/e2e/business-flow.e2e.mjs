// PRD v1.4 S2 critical commercial flow (API level, real PostgreSQL).
// Customer Registration → Booth Request → Quotation → Acceptance → Manual Invoice
// → Finance Verification → Operations Assignment, with negative scenarios.
// Requires a running app with a DISPOSABLE database: see docs/S1_S2_TEST_REPORT.md.
import {test} from "node:test";
import assert from "node:assert/strict";
import {adminLogin, customerSignup, Client} from "./lib.mjs";

const run = Date.now().toString(36);
const R = {};          // admin clients by role
const S = {};          // shared state
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));

test("setup: all seven roles can sign in", async () => {
  for (const role of ["SUPER_ADMIN","SALES","FINANCE","OPERATIONS","CONTENT_EDITOR","CHECKIN_STAFF","VIEWER"]) R[role] = await adminLogin(role);
});

test("event publication is Super Admin only", async () => {
  const body = {published: true, visitorOpen: true, reason: "E2E disposable test event"};
  ok(await R.OPERATIONS.patch("/api/admin/events", body), 403, "ops publish event");
  ok(await R.SUPER_ADMIN.patch("/api/admin/events", body), 200, "sa publish event");
});

test("floorplan: create draft, add units, save, reload, publish", async () => {
  ok(await R.SALES.post("/api/admin/floorplans", {title: "Sales draft " + run}), 403, "sales cannot create floorplan");
  const c = await R.OPERATIONS.post("/api/admin/floorplans", {title: "E2E Hall " + run, canvasWidth: 1200, canvasHeight: 800});
  ok(c, 201, "create draft");
  S.plan = c.body.plan;
  const units = ["A1","A2","A3","A4"].map((code, i) => ({code: code + run.slice(-3), category: "Standard", hall: "A", x: 20 + i * 120, y: 20, w: 100, h: 60, areaSqm: 9}));
  const save = await R.OPERATIONS.put(`/api/admin/floorplans/${S.plan.id}/units`, {rowVersion: S.plan.rowVersion, units});
  ok(save, 200, "save units");
  const stale = await R.OPERATIONS.put(`/api/admin/floorplans/${S.plan.id}/units`, {rowVersion: S.plan.rowVersion, units});
  assert.equal(stale.status, 409, "stale rowVersion must conflict, got " + stale.status);
  const reload = await R.OPERATIONS.get(`/api/admin/floorplans/${S.plan.id}`);
  ok(reload, 200, "reload");
  const plan = reload.body.plan ?? reload.body;
  const loaded = plan.units ?? reload.body.units;
  assert.equal(loaded.length, 4, "4 units persisted");
  S.units = loaded; S.rowVersion = plan.rowVersion;
  const pre = await R.OPERATIONS.get(`/api/admin/floorplans/${S.plan.id}/publish`);
  ok(pre, 200, "publish preflight");
  ok(await R.SALES.post(`/api/admin/floorplans/${S.plan.id}/publish`, {rowVersion: S.rowVersion, reason: "sales attempt", confirmReconciliation: true}), 403, "sales publish");
  const pub = await R.OPERATIONS.post(`/api/admin/floorplans/${S.plan.id}/publish`, {rowVersion: S.rowVersion, reason: "E2E publish approved", confirmReconciliation: true});
  ok(pub, 200, "publish");
  const pubView = await new Client("anon").get("/api/public/floorplan");
  ok(pubView, 200, "public floorplan");
  assert.equal(pubView.body.units.length, 4);
});

test("customer: verified account, profile and booth preference (not a reservation)", async () => {
  S.cust = await customerSignup(`buyer-${run}@test.local`, "E2E Buyer");
  S.other = await customerSignup(`other-${run}@test.local`, "E2E Other");
  ok(await S.cust.patch("/api/customer/me", {fullName: "E2E Buyer", organization: "PT Uji Coba"}), 200, "profile");
  const [u1, u2] = S.units;
  const body = {floorplanId: S.plan.id, preferredUnitIds: [u1.id], requestedAreaSqm: 18, company: "PT Uji Coba", picName: "Test PIC", products: "Mining equipment", location: "INDOOR", notes: "E2E", consent: true};
  const r = await S.cust.post("/api/customer/booth-requests", body);
  ok(r, 201, "booth request");
  S.requestId = r.body.id ?? r.body.request?.id ?? r.body.boothRequest?.id;
  assert.ok(S.requestId, "request id in response " + JSON.stringify(r.body));
  const retry = await S.cust.post("/api/customer/booth-requests", body);
  ok(retry, 200, "FR-066 identical retry"); assert.equal(retry.body.id, S.requestId); assert.equal(retry.body.duplicate, true);
  const dup = await S.cust.post("/api/customer/booth-requests", {...body, preferredUnitIds: [u1.id, u1.id]});
  ok(dup, 400, "duplicate unit in one request");
  const pubView = await new Client("anon").get("/api/public/floorplan");
  const st = pubView.body.units.find(x => x.id === u1.id)?.status;
  assert.equal(st, "AVAILABLE", "preference must not reserve the unit");
  ok(await new Client("anon").post("/api/customer/booth-requests", body), 401, "anonymous booth request");
});

test("sales: review and quotation revisions; quotation does not lock booth", async () => {
  const [u1, u2] = S.units;
  ok(await R.FINANCE.post(`/api/admin/booth-requests/${S.requestId}/offer`, {offeredUnitIds: [u1.id], quotedPriceMinor: "10000000", reason: "finance should not quote"}), 403, "finance quote");
  ok(await R.SALES.post(`/api/admin/booth-requests/${S.requestId}/status`, {status: "UNDER_REVIEW", reason: "E2E start review"}), 200, "under review");
  const o1 = await R.SALES.post(`/api/admin/booth-requests/${S.requestId}/offer`, {offeredUnitIds: [u1.id], quotedPriceMinor: "10000000", reason: "E2E first quotation"});
  ok(o1, 201, "offer rev1");
  const o2 = await R.SALES.post(`/api/admin/booth-requests/${S.requestId}/offer`, {offeredUnitIds: [u1.id, u2.id], quotedPriceMinor: "20000000", reason: "E2E revised quotation"});
  ok(o2, 201, "offer rev2");
  S.offer1 = o1.body.offer?.id ?? o1.body.id; S.offer2 = o2.body.offer?.id ?? o2.body.id;
  assert.ok(S.offer1 && S.offer2, "offer ids " + JSON.stringify(o2.body));
  const pubView = await new Client("anon").get("/api/public/floorplan");
  for (const u of [u1, u2]) assert.equal(pubView.body.units.find(x => x.id === u.id)?.status, "AVAILABLE", "offer must not lock " + u.code);
  ok(await R.SALES.post(`/api/admin/booth-requests/${S.requestId}/status`, {status: "WAITING_INVOICE", reason: "skip acceptance attempt"}), 409, "cannot skip customer acceptance");
});

test("customer: only the latest quotation of their own request can be accepted", async () => {
  const stale = await S.cust.post(`/api/customer/booth-requests/${S.requestId}/accept`, {offerId: S.offer1});
  assert.equal(stale.status, 409, "stale offer → 409, got " + stale.status);
  const foreign = await S.other.post(`/api/customer/booth-requests/${S.requestId}/accept`, {offerId: S.offer2});
  assert.ok([403, 404].includes(foreign.status), "other customer accept → 403/404, got " + foreign.status);
  ok(await S.cust.post(`/api/customer/booth-requests/${S.requestId}/accept`, {offerId: S.offer2}), 200, "accept latest");
  const again = await S.cust.post(`/api/customer/booth-requests/${S.requestId}/accept`, {offerId: S.offer2});
  assert.ok([200, 409].includes(again.status), "double accept is idempotent or conflict, got " + again.status);
});

test("temporary holds: Operations only, 1-168h, one active hold per unit, release", async () => {
  const path = `/api/admin/booth-requests/${S.requestId}/holds`;
  ok(await R.SALES.post(path, {expiresInHours: 24, reason: "sales hold attempt"}), 403, "sales hold");
  ok(await R.OPERATIONS.post(path, {expiresInHours: 169, reason: "too long hold"}), 400, "169h refused");
  const h = await R.OPERATIONS.post(path, {expiresInHours: 24, reason: "E2E temporary hold"});
  assert.ok([200, 201].includes(h.status), "create hold → " + h.status + " " + JSON.stringify(h.body).slice(0, 200));
  const again = await R.OPERATIONS.post(path, {expiresInHours: 24, reason: "E2E duplicate hold"});
  assert.equal(again.status, 409, "second active hold → 409, got " + again.status);
  const view = await R.FINANCE.get(path);
  ok(view, 200, "finance can view holds");
  const pub = await new Client("anon").get("/api/public/floorplan");
  assert.equal(pub.body.units.find(x => x.id === S.units[0].id)?.status, "RESERVED", "held unit shows RESERVED");
  ok(await R.OPERATIONS.del(path, {reason: "E2E release hold"}), 200, "release");
  const after = await new Client("anon").get("/api/public/floorplan");
  assert.equal(after.body.units.find(x => x.id === S.units[0].id)?.status, "AVAILABLE", "released unit AVAILABLE");
});

test("assignment before verified payment is refused", async () => {
  ok(await R.OPERATIONS.post(`/api/admin/booth-requests/${S.requestId}/assign`, {reason: "E2E premature assign"}), 409, "assign before payment");
});

test("manual invoice: draft by Sales, issue by Finance only, must equal accepted quote", async () => {
  const me = await S.cust.get("/api/customer/me"); S.accountId = me.body.id;
  const wrong = await R.SALES.post("/api/admin/invoices", {accountId: S.accountId, boothRequestId: S.requestId, items: [{description: "Booth space", quantity: 1, unitPriceMinor: "15000000"}]});
  ok(wrong, 409, "invoice ≠ accepted quote");
  const d = await R.SALES.post("/api/admin/invoices", {accountId: S.accountId, boothRequestId: S.requestId, items: [{description: "Booth space 2 units", quantity: 1, unitPriceMinor: "20000000"}], minimumDpMinor: "5000000"});
  ok(d, 201, "draft invoice");
  S.invoice = d.body.id;
  ok(await R.OPERATIONS.post("/api/admin/invoices", {accountId: S.accountId, items: [{description: "x", quantity: 1, unitPriceMinor: "1"}]}), 403, "operations cannot draft invoice");
  ok(await R.SALES.post(`/api/admin/invoices/${S.invoice}/issue`, {}), 403, "sales cannot issue");
  ok(await R.FINANCE.post(`/api/admin/invoices/${S.invoice}/issue`, {}), 200, "finance issues");
  ok(await R.SALES.post(`/api/admin/invoices/${S.invoice}/send`, {channel: "EMAIL", reason: "E2E send invoice"}), 200, "send invoice");
  const list = await S.cust.get("/api/customer/invoices");
  ok(list, 200, "customer invoices");
  const pdf = await S.cust.get(`/api/customer/invoices/${S.invoice}/pdf`);
  ok(pdf, 200, "own invoice pdf");
  const foreignPdf = await S.other.get(`/api/customer/invoices/${S.invoice}/pdf`);
  assert.ok([403, 404].includes(foreignPdf.status), "other customer pdf → 403/404, got " + foreignPdf.status);
});

test("finance verification: only Finance, DP is partial, full payment does not auto-assign", async () => {
  const pay = (amount, ref) => ({amountMinor: amount, bankReference: ref, transferredAt: new Date().toISOString(), bankVerified: true, reason: "E2E bank statement matched"});
  ok(await R.SALES.post(`/api/admin/invoices/${S.invoice}/verify-transfer`, pay("5000000", "REF-S-" + run)), 403, "sales verify");
  ok(await R.OPERATIONS.post(`/api/admin/invoices/${S.invoice}/verify-transfer`, pay("5000000", "REF-O-" + run)), 403, "ops verify");
  const dp = await R.FINANCE.post(`/api/admin/invoices/${S.invoice}/verify-transfer`, pay("5000000", "REF-DP-" + run));
  ok(dp, 200, "verify DP");
  const dupRef = await R.FINANCE.post(`/api/admin/invoices/${S.invoice}/verify-transfer`, pay("5000000", "REF-DP-" + run));
  assert.equal(dupRef.status, 409, "duplicate bank reference → 409, got " + dupRef.status);
  ok(await R.OPERATIONS.post(`/api/admin/booth-requests/${S.requestId}/assign`, {reason: "E2E assign after DP only"}), 409, "assign on DP when flag disabled");
  const over = await R.FINANCE.post(`/api/admin/invoices/${S.invoice}/verify-transfer`, pay("99000000", "REF-OVER-" + run));
  assert.equal(over.status, 409, "overpayment refused, got " + over.status);
  assert.equal(over.body.error, "AMOUNT_EXCEEDS_OUTSTANDING");
  ok(await R.FINANCE.post(`/api/admin/invoices/${S.invoice}/verify-transfer`, pay("15000000", "REF-FULL-" + run)), 200, "verify remaining");
  const inv = (await S.cust.get("/api/customer/invoices")).body;
  const mine = (inv.invoices ?? inv).find(x => x.id === S.invoice);
  assert.equal(mine.status, "PAID", "invoice PAID");
  const pubView = await new Client("anon").get("/api/public/floorplan");
  for (const u of S.units.slice(0, 2)) assert.equal(pubView.body.units.find(x => x.id === u.id)?.status, "AVAILABLE", "paid ≠ auto-assigned");
});

test("AT-068: one bank reference cannot be credited to a second invoice", async () => {
  const u3 = S.units[2];
  ok(await S.other.patch("/api/customer/me", {fullName: "E2E Other", organization: "PT Lain"}), 200, "other profile");
  const br = await S.other.post("/api/customer/booth-requests", {floorplanId: S.plan.id, preferredUnitIds: [u3.id], requestedAreaSqm: 9, company: "PT Lain", picName: "Test PIC", products: "Mining equipment", location: "INDOOR", consent: true});
  ok(br, 201, "other booth request");
  const rid = br.body.id ?? br.body.request?.id ?? br.body.boothRequest?.id;
  ok(await R.SALES.post(`/api/admin/booth-requests/${rid}/status`, {status: "UNDER_REVIEW", reason: "E2E start review"}), 200, "review");
  const of = await R.SALES.post(`/api/admin/booth-requests/${rid}/offer`, {offeredUnitIds: [u3.id], quotedPriceMinor: "3000000", reason: "E2E quotation other"});
  ok(of, 201, "offer other");
  ok(await S.other.post(`/api/customer/booth-requests/${rid}/accept`, {offerId: of.body.offer?.id ?? of.body.id}), 200, "accept other");
  const meO = (await S.other.get("/api/customer/me")).body;
  const d = await R.FINANCE.post("/api/admin/invoices", {accountId: meO.id, boothRequestId: rid, items: [{description: "E2E other invoice", quantity: 1, unitPriceMinor: "3000000"}]});
  ok(d, 201, "draft other");
  ok(await R.FINANCE.post(`/api/admin/invoices/${d.body.id}/issue`, {}), 200, "issue other");
  const pay = ref => ({amountMinor: "1000000", bankReference: ref, transferredAt: new Date().toISOString(), bankVerified: true, reason: "E2E bank statement matched"});
  const reused = await R.FINANCE.post(`/api/admin/invoices/${d.body.id}/verify-transfer`, pay(" ref-full-" + run + " "));
  assert.equal(reused.status, 409, "reused reference (case/space-insensitive) → 409, got " + reused.status);
  const [a, b] = await Promise.all([
    R.FINANCE.post(`/api/admin/invoices/${d.body.id}/verify-transfer`, pay("REF-RACE-" + run)),
    R.FINANCE.post(`/api/admin/invoices/${d.body.id}/verify-transfer`, pay("REF-RACE-" + run))
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409], "concurrent duplicate → exactly one credited, got " + a.status + "/" + b.status);
});

test("operations assignment: atomic, Operations only, no double assignment", async () => {
  ok(await R.FINANCE.post(`/api/admin/booth-requests/${S.requestId}/assign`, {reason: "finance assign attempt"}), 403, "finance assign");
  ok(await R.OPERATIONS.post(`/api/admin/booth-requests/${S.requestId}/assign`, {reason: "E2E assignment approved"}), 200, "assign");
  const again = await R.OPERATIONS.post(`/api/admin/booth-requests/${S.requestId}/assign`, {reason: "E2E repeated assignment"});
  assert.equal(again.status, 409, "second assign → 409, got " + again.status);
  const pubView = await new Client("anon").get("/api/public/floorplan");
  for (const u of S.units.slice(0, 2)) assert.equal(pubView.body.units.find(x => x.id === u.id)?.status, "OCCUPIED", "unit occupied");
  // A second customer cannot request an occupied unit.
  const r = await S.other.post("/api/customer/booth-requests", {floorplanId: S.plan.id, preferredUnitIds: [S.units[0].id], requestedAreaSqm: 9, company: "PT Lain", picName: "Test PIC", products: "Mining equipment", location: "INDOOR", consent: true});
  assert.equal(r.status, 409, "occupied unit preference → 409, got " + r.status);
});

test("customer sees assigned booth; CMS and audit are consistent", async () => {
  const me = (await S.cust.get("/api/customer/me")).body;
  const req = me.requests.find(x => x.id === S.requestId);
  assert.equal(req.status, "CONFIRMED", "request CONFIRMED");
  const adminList = await R.OPERATIONS.get("/api/admin/booth-requests?id=" + S.requestId);
  ok(adminList, 200, "admin booth list");
  const audit = await R.SUPER_ADMIN.get("/api/admin/audit");
  ok(audit, 200, "audit");
  const actions = JSON.stringify(audit.body);
  for (const a of ["INVOICE_DRAFT_CREATED"]) assert.ok(actions.includes(a), "audit has " + a);
  ok(await R.SALES.get("/api/admin/audit"), 403, "sales cannot read audit");
  const dash = await R.SUPER_ADMIN.get("/api/admin/dashboard");
  ok(dash, 200, "dashboard");
});

test("negative: expired quotation cannot be accepted", async () => {
  const c = await customerSignup(`late-${run}@test.local`, "E2E Late");
  ok(await c.patch("/api/customer/me", {fullName: "E2E Late", organization: "PT Telat"}), 200, "profile");
  const u4 = S.units[3];
  const br = await c.post("/api/customer/booth-requests", {floorplanId: S.plan.id, preferredUnitIds: [u4.id], requestedAreaSqm: 9, company: "PT Telat", picName: "Test PIC", products: "Mining equipment", location: "INDOOR", consent: true});
  ok(br, 201, "request");
  const rid = br.body.id ?? br.body.request?.id;
  ok(await R.SALES.post(`/api/admin/booth-requests/${rid}/status`, {status: "UNDER_REVIEW", reason: "E2E start review"}), 200, "review");
  const of = await R.SALES.post(`/api/admin/booth-requests/${rid}/offer`, {offeredUnitIds: [u4.id], quotedPriceMinor: "9000000", reason: "E2E short-lived quotation", expiresAt: new Date(Date.now() + 1500).toISOString()});
  ok(of, 201, "offer");
  await new Promise(r => setTimeout(r, 2000));
  const acc = await c.post(`/api/customer/booth-requests/${rid}/accept`, {offerId: of.body.offer?.id ?? of.body.id});
  assert.equal(acc.status, 409, "expired offer accept → 409, got " + acc.status);
  S.lateRequest = rid;
});

test("negative: replacing the published floorplan with open bookings is refused (no silent remap)", async () => {
  const d = await R.OPERATIONS.post("/api/admin/floorplans", {title: "Replacement " + run});
  ok(d, 201, "replacement draft");
  const plan = d.body.plan;
  ok(await R.OPERATIONS.put(`/api/admin/floorplans/${plan.id}/units`, {rowVersion: plan.rowVersion, units: [{code: "Z1", category: "Standard", x: 0, y: 0, w: 50, h: 50, areaSqm: 9}]}), 200, "units");
  const fresh = (await R.OPERATIONS.get(`/api/admin/floorplans/${plan.id}`)).body;
  const rv = (fresh.plan ?? fresh).rowVersion;
  const pub = await R.OPERATIONS.post(`/api/admin/floorplans/${plan.id}/publish`, {rowVersion: rv, reason: "E2E replacement attempt", confirmReconciliation: true});
  assert.equal(pub.status, 409, "publish with open bookings → 409, got " + pub.status);
  assert.equal(pub.body.error, "REMAP_REQUIRED");
  const live = await new Client("anon").get("/api/public/floorplan");
  assert.equal(live.body.units.length, 4, "original published plan untouched");
});
