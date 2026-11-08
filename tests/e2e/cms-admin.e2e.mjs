// PRD v1.4 Slice H/I/A: staff & roles (FR-147), customers + corrections + duplicates + notes (FR-120/148/153),
// settings status, exports with date basis & role scope (FR-031/067/121/122, AT-070/071/072), leads (FR-024/027/030/036), content (FR-005/009/035/038).
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup, Client, BASE} from "./lib.mjs";

const ExcelJS = createRequire(import.meta.url)("exceljs");
const db = new PrismaClient();
const run = Date.now().toString(36);
const R = {}, S = {};
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const cookie = c => [...c.jar].map(([k, v]) => k + "=" + v).join("; ");
const today = new Date().toLocaleDateString("en-CA", {timeZone: "Asia/Jakarta"});
const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString("en-CA", {timeZone: "Asia/Jakarta"});
test.after(() => db.$disconnect());

test("setup", async () => {
  for (const r of ["SUPER_ADMIN", "SALES", "FINANCE", "OPERATIONS", "CONTENT_EDITOR", "VIEWER"]) R[r] = await adminLogin(r);
  ok(await R.SUPER_ADMIN.patch("/api/admin/events", {published: true, visitorOpen: true, reason: "E2E cms admin"}), 200, "event");
  S.cust = await customerSignup(`cms-${run}@test.local`, "=HYPERLINK(\"http://x\")");
  ok(await S.cust.patch("/api/customer/me", {fullName: "Cms Customer", organization: "=SUM(1,1)"}), 200, "profile with formula-like org");
  const r = await S.cust.post("/api/customer/registrations", {kind: "VISITOR", consent: true}); ok(r, 201, "visitor"); S.enrollment = r.body.id;
  S.accountId = (await S.cust.get("/api/customer/me")).body.id;
});

test("FR-147 staff: Super Admin only; role change revokes sessions; last Super Admin & self-lockout protected", async () => {
  ok(await R.OPERATIONS.post("/api/admin/staff", {email: "x@test.local", role: "VIEWER", temporaryPassword: "a-very-long-password", reason: "ops attempt"}), 403, "ops create");
  const c = await R.SUPER_ADMIN.post("/api/admin/staff", {email: `staff-${run}@test.local`, role: "SALES", temporaryPassword: "temporary-password-123", reason: "E2E new sales staff"});
  ok(c, 201, "create");
  ok(await R.SUPER_ADMIN.post("/api/admin/staff", {email: `staff-${run}@test.local`, role: "SALES", temporaryPassword: "temporary-password-123", reason: "E2E duplicate"}), 409, "duplicate");
  const s = new Client("new-staff");
  ok(await s.post("/api/admin/auth/login", {email: `staff-${run}@test.local`, password: "temporary-password-123"}), 200, "temp login");
  ok(await s.get("/api/admin/booth-requests"), 200, "sales permission");
  ok(await R.SUPER_ADMIN.patch("/api/admin/staff/" + c.body.id, {role: "VIEWER", reason: "E2E role downgrade"}), 200, "role change");
  ok(await s.get("/api/admin/booth-requests"), 401, "old session revoked");
  const me = (await R.SUPER_ADMIN.get("/api/admin/me")).body;
  ok(await R.SUPER_ADMIN.patch("/api/admin/staff/" + me.id, {active: false, reason: "E2E self lockout"}), 409, "self lockout");
  ok(await R.SUPER_ADMIN.patch("/api/admin/staff/" + c.body.id, {active: false, reason: "E2E deactivate"}), 200, "deactivate");
  ok(await s.post("/api/admin/auth/login", {email: `staff-${run}@test.local`, password: "temporary-password-123"}), 401, "deactivated cannot log in");
});

test("settings status: Super Admin only; never returns secret values", async () => {
  ok(await R.FINANCE.get("/api/admin/settings"), 403, "finance");
  const s = await R.SUPER_ADMIN.get("/api/admin/settings");
  ok(s, 200, "settings");
  assert.equal(s.body.secrets.otpHashSecret, true); assert.equal(s.body.finance.makerCheckerThresholdMinor, "50000000");
  assert.ok(!JSON.stringify(s.body).includes("local-test-only"), "no secret values");
});

test("FR-120/148/153 customers: search, drill-down, correction with reason, notes hidden from customer", async () => {
  ok(await R.VIEWER.get("/api/admin/customers"), 403, "viewer");
  const l = await R.SALES.get("/api/admin/customers?q=cms-" + run);
  ok(l, 200, "list"); assert.equal(l.body.customers[0].id, S.accountId);
  const d = await R.FINANCE.get("/api/admin/customers/" + S.accountId); ok(d, 200, "detail"); assert.equal(d.body.enrollments.length, 1);
  ok(await R.OPERATIONS.patch("/api/admin/customers/" + S.accountId, {fullName: "Corrected Name"}), 400, "reason required");
  ok(await R.SALES.patch("/api/admin/customers/" + S.accountId, {fullName: "Sales Fix", reason: "sales correction attempt"}), 403, "sales cannot correct");
  ok(await R.OPERATIONS.patch("/api/admin/customers/" + S.accountId, {email: "x@test.local", reason: "ops email change attempt"}), 403, "ops cannot change email");
  ok(await R.OPERATIONS.patch("/api/admin/customers/" + S.accountId, {fullName: "Cms Customer Corrected", reason: "Spelling corrected per customer call"}), 200, "correct");
  const snap = (await db.enrollment.findUnique({where: {id: S.enrollment}})).profileSnapshot;
  assert.equal(snap.fullName, "Cms Customer", "historic booking snapshot unchanged");
  ok(await R.SALES.post("/api/admin/notes", {resourceType: "CustomerAccount", resourceId: S.accountId, body: "VIP — internal only " + run}), 201, "note");
  assert.equal((await R.OPERATIONS.get(`/api/admin/notes?resourceType=CustomerAccount&resourceId=${S.accountId}`)).body.notes.length, 1);
  ok(await R.VIEWER.get(`/api/admin/notes?resourceType=CustomerAccount&resourceId=${S.accountId}`), 403, "viewer notes");
  for (const p of ["/api/customer/me", "/api/customer/timeline", "/api/customer/invoices"]) assert.ok(!JSON.stringify((await S.cust.get(p)).body).includes("internal only"), "note hidden in " + p);
});

test("FR-153 duplicate registration: cancelled, passes revoked, kept record linked; non-duplicates refused", async () => {
  const keep = await db.enrollment.findUnique({where: {id: S.enrollment}});
  const extra = await db.enrollment.create({data: {accountId: keep.accountId, eventId: keep.eventId, type: "VISITOR", status: "CONFIRMED", profileSnapshot: keep.profileSnapshot, consentAt: new Date()}});
  await db.eventPass.create({data: {accountId: keep.accountId, enrollmentId: extra.id, eventId: keep.eventId, tokenHash: "dup-" + run, expiresAt: new Date(Date.now() + 864e5)}});
  ok(await R.SALES.post(`/api/admin/registrations/${extra.id}/mark-duplicate`, {keepId: keep.id, reason: "sales duplicate attempt"}), 403, "sales");
  const m = await R.OPERATIONS.post(`/api/admin/registrations/${extra.id}/mark-duplicate`, {keepId: keep.id, reason: "Customer registered twice"});
  ok(m, 200, "mark"); assert.equal(m.body.revokedPasses, 1);
  assert.equal((await db.enrollment.findUnique({where: {id: extra.id}})).status, "CANCELLED");
  assert.equal((await db.enrollment.findUnique({where: {id: keep.id}})).status, "CONFIRMED", "kept untouched");
});

test("AT-070/071/072 exports: date basis inclusive WIB, role-scoped datasets, formula-safe XLSX", async () => {
  const get = (c, q) => fetch(`${BASE}/api/admin/reports/export?${q}`, {headers: {cookie: cookie(c)}});
  assert.equal((await get(R.SALES, "dataset=finance&format=xlsx")).status, 403, "sales finance export");
  assert.equal((await get(R.VIEWER, "dataset=registrations&format=xlsx")).status, 403, "viewer export");
  assert.equal((await get(R.FINANCE, "dataset=registrations&basis=paid")).status, 400, "basis not valid for dataset");
  const none = await get(R.OPERATIONS, `dataset=registrations&from=${tomorrow}&to=${tomorrow}&q=${S.enrollment.slice(0, 8)}`);
  assert.equal(none.headers.get("x-export-rows"), "0", "future period excludes today");
  const one = await get(R.OPERATIONS, `dataset=registrations&from=${today}&to=${today}&q=${S.enrollment.slice(0, 8)}&format=xlsx`);
  assert.equal(one.status, 200); assert.equal(one.headers.get("x-export-rows"), "1", "inclusive WIB day");
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await one.arrayBuffer()));
  const ws = wb.worksheets[0]; const vals = ws.getRow(3).values.slice(1).map(String);
  assert.ok(vals.some(v => v === "'=SUM(1,1)"), "formula-like organization escaped: " + vals.join("|"));
  assert.ok(vals.every(v => !/^[=+@-]/.test(v)), "no live formula cells");
  assert.equal((await get(R.FINANCE, "dataset=finance&basis=paid&format=pdf")).status, 200, "finance pdf");
  const booths = await get(R.SALES, "dataset=booths&basis=created&format=xlsx"); assert.equal(booths.status, 200, "booth leads export");
  assert.ok(await db.exportJob.count({where: {reportType: "REGISTRATIONS"}}) >= 1 && await db.auditLog.count({where: {action: "REPORT_EXPORTED"}}) >= 3, "export jobs + audit");
});

test("FR-024/027/030/036 leads: consent + validation, UTM captured, duplicate & honeypot handled, inbox workflow, rate limit", async () => {
  const pub = new Client("visitor");
  const bad = await pub.post("/api/public/leads", {name: "A", email: "nope", message: "short"});
  ok(bad, 400, "invalid"); assert.ok(bad.body.issues.some(i => i.field === "email") && bad.body.issues.some(i => i.field === "consent"), "per-field errors");
  const body = {leadType: "PARTNER", name: "Partner Person", email: `lead-${run}@test.local`, company: "PT Mitra", message: "We would like to sponsor the conference.", consent: true, utmSource: "linkedin", utmCampaign: "launch"};
  const l = await pub.post("/api/public/leads", body); ok(l, 201, "lead"); assert.match(l.body.reference, /^IMDX-L-/);
  const again = await pub.post("/api/public/leads", body); ok(again, 200, "duplicate"); assert.equal(again.body.duplicate, true);
  ok(await pub.post("/api/public/leads", {...body, message: "Another distinct message here", website: "http://spam"}), 201, "honeypot silently accepted");
  assert.equal(await db.lead.count({where: {email: `lead-${run}@test.local`}}), 1, "honeypot not stored");
  const row = await db.lead.findFirst({where: {email: `lead-${run}@test.local`}, orderBy: {createdAt: "asc"}});
  assert.equal(row.utmSource, "linkedin"); assert.ok(row.consentAt);
  for (const n of ["second", "third", "fourth"]) ok(await pub.post("/api/public/leads", {...body, message: "Stored lead number " + n + " for the limit"}), 201, n);
  ok(await pub.post("/api/public/leads", {...body, message: "Fifth stored lead beyond the limit"}), 429, "rate limited at 4 per IP per hour (test setting)");
  ok(await R.CONTENT_EDITOR.get("/api/admin/leads"), 403, "editor inbox");
  const inbox = await R.SALES.get("/api/admin/leads?status=NEW"); ok(inbox, 200, "inbox"); assert.ok(inbox.body.leads.some(x => x.id === row.id));
  ok(await R.SALES.patch("/api/admin/leads/" + row.id, {status: "NEW", reason: "noop"}), 409, "bad transition");
  ok(await R.SALES.patch("/api/admin/leads/" + row.id, {status: "CONTACTED", reason: "Called partner"}), 200, "contacted");
  ok(await R.OPERATIONS.patch("/api/admin/leads/" + row.id, {status: "QUALIFIED", reason: "ops attempt"}), 403, "ops cannot change");
  assert.equal(await db.auditLog.count({where: {resourceId: row.id, action: "LEAD_STATUS_CHANGED"}}), 1);
});

test("FR-005/009/035/038 content: drafts private, rights required to publish media, locale fallback", async () => {
  ok(await R.SALES.post("/api/admin/content", {kind: "PARTNER", title: "X", slug: "x-" + run}), 403, "sales");
  const p = await R.CONTENT_EDITOR.post("/api/admin/content", {kind: "PARTNER", title: "PT Mitra Tambang", slug: "mitra-" + run, role: "Supporting partner", imageUrl: "/assets/logo-mitra.png", altText: "PT Mitra Tambang logo", rightsStatus: "PENDING_APPROVAL"});
  ok(p, 201, "draft");
  assert.ok(!JSON.stringify((await new Client("anon").get("/api/public/content?kind=PARTNER")).body).includes("mitra-" + run), "draft not public");
  const blocked = await R.CONTENT_EDITOR.patch("/api/admin/content/" + p.body.item.id, {status: "PUBLISHED", reason: "Publish partner"});
  ok(blocked, 409, "rights pending blocks publish");
  ok(await R.CONTENT_EDITOR.patch("/api/admin/content/" + p.body.item.id, {rightsStatus: "ORGANIZER_PROVIDED", status: "PUBLISHED", reason: "Rights confirmed by organizer"}), 200, "publish");
  const en = await new Client("anon").get("/api/public/content?kind=PARTNER");
  assert.ok(en.body.items.some(i => i.slug === "mitra-" + run && i.role === "Supporting partner"));
  const id = await new Client("anon").get("/api/public/content?kind=PARTNER&locale=id");
  assert.ok(id.body.items.some(i => i.slug === "mitra-" + run), "ID locale falls back to EN");
  const dl = await R.CONTENT_EDITOR.post("/api/admin/content", {kind: "DOWNLOAD", title: "Exhibitor brochure", slug: "brochure-" + run, url: "javascript:alert(1)"});
  ok(dl, 400, "unsafe URL rejected");
  ok(await new Client("anon").get("/api/public/content?kind=SECRET"), 400, "unknown kind");
});
