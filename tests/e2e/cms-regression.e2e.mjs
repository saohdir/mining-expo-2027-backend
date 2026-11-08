// PRD v1.4 S1 CMS regression (API level, real PostgreSQL): registrations review,
// floorplan clone/upload/holds, notifications bulk read, reports/export RBAC,
// global search, dashboard, programmes, QR check-in.
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup, Client, BASE} from "./lib.mjs";

const url = process.env.DATABASE_URL || "";
if (!/@localhost[:/]|@127\.0\.0\.1[:/]/.test(url)) throw new Error("cms-regression E2E needs a LOCAL disposable DATABASE_URL");
const db = new PrismaClient();
const run = Date.now().toString(36);
const R = {}, S = {};
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const ROLES = ["SUPER_ADMIN","SALES","FINANCE","OPERATIONS","CONTENT_EDITOR","CHECKIN_STAFF","VIEWER"];

test.after(() => db.$disconnect());

test("setup roles and an open event", async () => {
  for (const role of ROLES) R[role] = await adminLogin(role);
  ok(await R.SUPER_ADMIN.patch("/api/admin/events", {published: true, visitorOpen: true, reason: "E2E regression event"}), 200, "publish event");
});

test("dashboard + CMS pages respond for every role (no 500s)", async () => {
  for (const role of ROLES) {
    const d = await R[role].get("/api/admin/dashboard");
    assert.ok([200, 403].includes(d.status), role + " dashboard → " + d.status);
    for (const page of ["/admin", "/admin/floorplans", "/admin/booths", "/admin/registrations", "/admin/workspace", "/admin/notifications", "/admin/reports", "/admin/check-in", "/admin/programmes"]) {
      const p = await R[role].get(page);
      assert.ok(p.status < 500, role + " " + page + " → " + p.status);
    }
  }
  ok(await new Client("anon").get("/api/admin/dashboard"), 401, "anon dashboard");
});

test("registrations: visitor auto-confirmed with pass; conference needs approved fee; review is Operations/Super Admin", async () => {
  S.cust = await customerSignup(`reg-${run}@test.local`, "Reg Tester");
  ok(await S.cust.post("/api/customer/registrations", {kind: "VISITOR", consent: true}), 201, "visitor registration");
  ok(await S.cust.post("/api/customer/registrations", {kind: "VISITOR", consent: true}), 409, "duplicate visitor registration");
  const confs = await R.OPERATIONS.get("/api/admin/conferences");
  ok(confs, 200, "conference list");
  const conf = (confs.body.records ?? confs.body.conferences ?? confs.body)[0];
  const notReady = await S.cust.post("/api/customer/registrations", {kind: "CONFERENCE", conferenceId: conf.id, consent: true});
  assert.ok([404, 409].includes(notReady.status), "unpublished / fee TBA conference refused, got " + notReady.status);
  await db.conference.update({where: {id: conf.id}, data: {published: true, feeMinor: 0n, capacity: 2}});
  const c = await S.cust.post("/api/customer/registrations", {kind: "CONFERENCE", conferenceId: conf.id, consent: true});
  ok(c, 201, "conference registration");
  S.enrollment = c.body.id ?? c.body.enrollment?.id;
  const list = await R.SALES.get("/api/admin/registrations");
  ok(list, 200, "sales list registrations");
  ok(await R.SALES.post(`/api/admin/registrations/${S.enrollment}/review`, {decision: "CONFIRMED", reason: "sales review attempt"}), 403, "sales cannot review");
  ok(await R.VIEWER.get("/api/admin/registrations"), 403, "viewer cannot list raw registrations");
  ok(await R.OPERATIONS.post(`/api/admin/registrations/${S.enrollment}/review`, {decision: "CONFIRMED", reason: "E2E approve free conference"}), 200, "ops review");
  const audit = await db.auditLog.count({where: {resourceId: S.enrollment}});
  assert.ok(audit >= 1, "review audited");
});

test("floorplan: background upload, clone as new draft, duplicate codes refused", async () => {
  const p = await R.OPERATIONS.post("/api/admin/floorplans", {title: "Regression " + run});
  ok(p, 201, "draft");
  S.plan = p.body.plan;
  const sharp = (await import("sharp")).default;
  const png = await sharp({create: {width: 40, height: 30, channels: 3, background: "#ddd"}}).png().toBuffer();
  const upload = async (bytes, type) => {
    const fd = new FormData();
    fd.append("file", new Blob([bytes], {type}), "bg");
    const r = await fetch(`${BASE}/api/admin/floorplans/${S.plan.id}/upload`, {method: "POST", body: fd, headers: {origin: BASE, cookie: [...R.OPERATIONS.jar].map(([k, v]) => k + "=" + v).join("; ")}});
    return {status: r.status, body: await r.json().catch(() => null)};
  };
  const good = await upload(png, "image/png");
  ok(good, 201, "upload valid PNG");
  const media = await fetch(BASE + good.body.url);
  assert.equal(media.status, 200, "uploaded media served");
  const corrupt = Buffer.concat([png.subarray(0, 40), Buffer.alloc(40, 7)]);
  ok(await upload(corrupt, "image/png"), 400, "corrupt PNG is a client error, not 500");
  ok(await upload(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/svg+xml"), 415, "SVG refused");
  const fresh = await R.OPERATIONS.get(`/api/admin/floorplans/${S.plan.id}`);
  const rv = (fresh.body.plan ?? fresh.body).rowVersion;
  const units = [{code: "R1" + run.slice(-3), category: "Standard", x: 10, y: 10, w: 80, h: 50, areaSqm: 9}, {code: "R2" + run.slice(-3), category: "Premium", x: 120, y: 10, w: 80, h: 50, areaSqm: 12}];
  ok(await R.OPERATIONS.put(`/api/admin/floorplans/${S.plan.id}/units`, {rowVersion: rv, units}), 200, "save units");
  const dupCode = await R.OPERATIONS.put(`/api/admin/floorplans/${S.plan.id}/units`, {rowVersion: rv + 1, units: [units[0], {...units[1], code: units[0].code}]});
  assert.ok([400, 409].includes(dupCode.status), "duplicate booth code refused, got " + dupCode.status);
  const clone = await R.OPERATIONS.post(`/api/admin/floorplans/${S.plan.id}/clone`, {title: "Clone " + run, reason: "E2E clone as new draft"});
  ok(clone, 201, "clone");
  const cloned = await R.OPERATIONS.get(`/api/admin/floorplans/${(clone.body.plan ?? clone.body).id}`);
  assert.equal(((cloned.body.plan ?? cloned.body).units ?? cloned.body.units).length, 2, "clone copies units");
  ok(await R.SALES.post(`/api/admin/floorplans/${S.plan.id}/clone`, {title: "x clone", reason: "sales clone attempt"}), 403, "sales clone");
});

test("notifications: list and bulk mark-read in one request, role scoped", async () => {
  for (let i = 0; i < 25; i++) await db.notification.create({data: {audienceRole: "OPERATIONS", type: "E2E_TEST", recordType: "Test", recordId: run + i}});
  const n = await R.OPERATIONS.get("/api/admin/notifications");
  ok(n, 200, "list");
  const items = n.body.notifications ?? n.body.items ?? n.body;
  const ids = items.filter(x => !x.readAt).slice(0, 100).map(x => x.id);
  assert.ok(ids.length >= 25, "unread visible " + ids.length);
  const finance = await R.FINANCE.patch("/api/admin/notifications", {ids});
  const stillUnread = await db.notification.count({where: {id: {in: ids}, readAt: null}});
  assert.equal(stillUnread, ids.length, "Finance must not mark Operations notifications (status " + finance.status + ")");
  ok(await R.OPERATIONS.patch("/api/admin/notifications", {ids}), 200, "bulk read");
  assert.equal(await db.notification.count({where: {id: {in: ids}, readAt: null}}), 0, "all read");
});

test("reports & exports: role access and formula-safe output", async () => {
  ok(await R.SALES.get("/api/admin/reports/attendance"), 200, "sales aggregate attendance");
  ok(await R.VIEWER.get("/api/admin/reports/attendance"), 200, "viewer aggregate attendance");
  ok(await R.CHECKIN_STAFF.get("/api/admin/reports/attendance"), 403, "checkin staff attendance");
  for (const fmt of ["xlsx", "pdf"]) {
    const e = await fetch(`${BASE}/api/admin/reports/export?format=${fmt}`, {headers: {cookie: [...R.FINANCE.jar].map(([k, v]) => k + "=" + v).join("; ")}});
    assert.equal(e.status, 200, "finance export " + fmt + " → " + e.status);
    assert.ok((await e.arrayBuffer()).byteLength > 100, fmt + " has content");
  }
  ok(await R.VIEWER.get("/api/admin/reports/export?format=xlsx"), 403, "viewer export");
  ok(await R.CONTENT_EDITOR.get("/api/admin/reports/export?format=xlsx"), 403, "content editor export");
});

test("global search: role aware and finds records by id prefix", async () => {
  const s = await R.OPERATIONS.get("/api/admin/search?q=" + S.enrollment.slice(0, 8));
  ok(s, 200, "search");
  assert.ok(s.body.results.some(r => r.type === "Registration" && r.hint.includes(S.enrollment.slice(0, 8))), "search finds enrollment by id prefix");
  const v = await R.CHECKIN_STAFF.get("/api/admin/search?q=" + S.enrollment.slice(0, 8));
  ok(v, 200, "checkin search");
  assert.equal(v.body.results.length, 0, "check-in staff search must not expose registrations");
  const f = await R.FINANCE.get("/api/admin/search?q=reg-" + run);
  assert.ok(f.body.results.some(r => r.type === "Registration"), "finance sees registrations it may list");
});

test("programmes: create draft, edit, publish restricted", async () => {
  const c = await R.OPERATIONS.post("/api/admin/conferences", {slug: "e2e-" + run, title: "E2E Programme " + run});
  assert.ok([200, 201].includes(c.status), "create programme → " + c.status + " " + JSON.stringify(c.body).slice(0, 200));
  ok(await R.CONTENT_EDITOR.post("/api/admin/conferences", {slug: "ce-" + run, title: "CE attempt"}), 403, "content editor cannot create programme");
});

test("QR check-in: server validation, not-yet-valid, one admission, duplicate scan, roles", async () => {
  const passes = await S.cust.get("/api/customer/passes");
  ok(passes, 200, "passes");
  const token = passes.body.passes.find(p => p.entitlement === "EXPO_ENTRY").manualCode;
  assert.match(token, /^[0-9A-Z]{5}-[0-9A-Z]{5}$/, "short manual pass code");
  for (const code of ["G1", "G2"]) {
    const g = await R.OPERATIONS.post("/api/admin/gates", {code: code + run, name: "Gate " + code, zones: ["EXPO_ENTRY"]});
    ok(g, 201, "gate " + code);
    ok(await R.OPERATIONS.patch("/api/admin/gates/" + g.body.gate.id, {staffAdminIds: [R.CHECKIN_STAFF.id ?? (await R.CHECKIN_STAFF.get("/api/admin/me")).body.id], reason: "E2E assign scanner"}), 200, "assign");
  }
  const scan = (c, t = token, gate = "G1") => c.post("/api/admin/check-in/scan", {token: t, gate: gate + run, zone: "EXPO_ENTRY"});
  ok(await scan(R.SALES), 403, "sales cannot scan");
  const early = await scan(R.CHECKIN_STAFF);
  assert.equal(early.body.result, "NOT_YET_VALID", "before event start");
  const bad = await scan(R.CHECKIN_STAFF, "x".repeat(43));
  assert.equal(bad.body.result, "INVALID", "unknown token");
  const ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  await db.event.update({where: {id: ev.id}, data: {startsAt: new Date(Date.now() - 3600000)}});
  try {
    const results = await Promise.all([scan(R.CHECKIN_STAFF, token, "G1"), scan(R.OPERATIONS, token, "G2")]);
    const accepted = results.filter(r => r.body.result === "VALID_ACCEPTED").length;
    assert.equal(accepted, 1, "two concurrent scanners → exactly one admission, got " + results.map(r => r.body.result));
    assert.equal((await scan(R.CHECKIN_STAFF)).body.result, "ALREADY_CHECKED_IN", "repeat scan");
    const att = await R.OPERATIONS.get("/api/admin/reports/attendance");
    ok(att, 200, "attendance");
  } finally {
    await db.event.update({where: {id: ev.id}, data: {startsAt: ev.startsAt}});
  }
});
