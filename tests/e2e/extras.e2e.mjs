// Technical completion: background exports (NFR-26/FR-122), KPI presets (FR-149), SVG upload (FR-091),
// exhibitor directory + boothNo (FR-014/110), attendance history (FR-078), waitlist (FR-155),
// notification preference (FR-152), pass-ready email (FR-079). Runs after business-flow/floorplan suites.
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, completeParticipant, customerSignup, Client, BASE} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const R = {}, S = {};
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const cookie = c => [...c.jar].map(([k, v]) => k + "=" + v).join("; ");
const sleep = ms => new Promise(r => setTimeout(r, ms));
test.after(async () => { if (S.ev) await db.event.update({where: {id: S.ev.id}, data: {startsAt: S.ev.startsAt}}); await db.$disconnect(); });

test("setup", async () => { for (const r of ["SUPER_ADMIN", "SALES", "FINANCE", "OPERATIONS", "VIEWER"]) R[r] = await adminLogin(r);
  ok(await R.SUPER_ADMIN.patch("/api/admin/events", {published: true, visitorOpen: true, reason: "E2E extras"}), 200, "event"); });

test("NFR-26/FR-122 background export: queued, processed by worker, requester-only download, expiry", async () => {
  ok(await R.SALES.post("/api/admin/exports", {dataset: "finance", basis: "created"}), 403, "sales finance");
  ok(await R.VIEWER.post("/api/admin/exports", {dataset: "registrations", basis: "created"}), 403, "viewer");
  ok(await R.SALES.post("/api/admin/exports", {dataset: "registrations", basis: "paid"}), 400, "bad basis");
  const q = await R.SALES.post("/api/admin/exports", {dataset: "booths", basis: "created", format: "xlsx"});
  ok(q, 202, "queued");
  let job;
  for (let i = 0; i < 30; i++) { job = (await R.SALES.get("/api/admin/exports")).body.jobs.find(j => j.id === q.body.id); if (job.state === "COMPLETED" || job.state === "FAILED") break; await sleep(500); }
  assert.equal(job.state, "COMPLETED", "worker completed job: " + JSON.stringify(job));
  const dl = await fetch(`${BASE}/api/admin/exports/${q.body.id}/download`, {headers: {cookie: cookie(R.SALES)}});
  assert.equal(dl.status, 200); assert.ok((await dl.arrayBuffer()).byteLength > 1000, "xlsx bytes");
  assert.equal((await fetch(`${BASE}/api/admin/exports/${q.body.id}/download`, {headers: {cookie: cookie(R.OPERATIONS)}})).status, 404, "other staff cannot download");
  const file = (await db.exportJob.findUnique({where: {id: q.body.id}})).objectKey;
  assert.match(file, /\.xlsx$/, "stored privately");
  await db.exportJob.update({where: {id: q.body.id}, data: {expiresAt: new Date(Date.now() - 1000)}});
  assert.equal((await fetch(`${BASE}/api/admin/exports/${q.body.id}/download`, {headers: {cookie: cookie(R.SALES)}})).status, 410, "expired");
  assert.ok(await db.auditLog.count({where: {resourceId: q.body.id, action: {in: ["EXPORT_QUEUED", "EXPORT_DOWNLOADED"]}}}) >= 2);
});

test("FR-149 KPI presets with explicit basis; money KPIs only for finance-capable roles", async () => {
  for (const p of ["today", "7d", "30d", "month", "all"]) ok(await R.OPERATIONS.get("/api/admin/reports/kpi?period=" + p), 200, p);
  ok(await R.OPERATIONS.get("/api/admin/reports/kpi?period=custom&from=2026-02-01&to=2026-01-01"), 400, "inverted custom");
  const v = await R.VIEWER.get("/api/admin/reports/kpi?period=all"); ok(v, 200, "viewer");
  assert.ok(v.body.kpis.every(k => k.basis), "every KPI states its basis");
  assert.ok(!v.body.kpis.some(k => k.key === "verifiedReceiptsIdr"), "viewer sees no money");
  const f = await R.FINANCE.get("/api/admin/reports/kpi?period=all");
  assert.ok(f.body.kpis.some(k => k.key === "verifiedReceiptsIdr" && BigInt(k.value) > 0n));
  const u = f.body.kpis.find(k => k.key === "uniqueRegistrants").value, total = ["visitorRegistrations", "conferenceBookings"].reduce((a, k) => a + f.body.kpis.find(x => x.key === k).value, 0);
  assert.ok(u <= total, "unique people never exceed registrations");
});

test("FR-091 SVG: safe SVG rasterised, unsafe SVG and PDF rejected", async () => {
  const p = await R.OPERATIONS.post("/api/admin/floorplans", {title: "Svg " + run});
  const up = async (body, type, name) => { const fd = new FormData(); fd.append("file", new Blob([body], {type}), name);
    const r = await fetch(`${BASE}/api/admin/floorplans/${p.body.plan.id}/upload`, {method: "POST", body: fd, headers: {origin: BASE, cookie: cookie(R.OPERATIONS)}}); return {status: r.status, body: await r.json()}; };
  const good = await up('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#eee"/><text x="20" y="40">Hall A</text></svg>', "image/svg+xml", "hall.svg");
  ok(good, 201, "safe svg"); assert.match(good.body.url, /\.webp$/, "served as raster");
  const bad = await up('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>', "image/svg+xml", "x.svg");
  ok(bad, 415, "unsafe svg"); assert.equal(bad.body.error, "UNSAFE_SVG");
  const pdf = await up("%PDF-1.4", "application/pdf", "plan.pdf"); ok(pdf, 415, "pdf"); assert.equal(pdf.body.error, "PDF_NOT_SUPPORTED");
});

test("FR-014/110 exhibitor directory: only approved names, booth numbers from active assignments, search", async () => {
  const pub = await new Client("anon").get("/api/public/exhibitors"); ok(pub, 200, "dir");
  assert.ok(!JSON.stringify(pub.body).match(/@|phone|email/i), "no PII");
  const a = await db.boothAssignment.findFirst({where: {active: true, boothUnit: {floorplan: {status: "PUBLISHED"}}}, include: {boothUnit: true}});
  if (!a) return;
  assert.ok(!pub.body.exhibitors.some(e => e.boothNo.includes(a.boothUnit.code)), "unapproved assignment hidden");
  await db.boothAssignment.update({where: {id: a.id}, data: {approvedForPublic: true}});
  await db.boothUnit.update({where: {id: a.boothUnitId}, data: {approvedPublicName: "PT Directory " + run}});
  const after = await new Client("anon").get("/api/public/exhibitors?q=directory " + run);
  assert.equal(after.body.exhibitors.length, 1); assert.match(after.body.exhibitors[0].boothNo, new RegExp(a.boothUnit.code));
  assert.equal((await new Client("anon").get("/api/public/exhibitors?q=" + a.boothUnit.code)).body.exhibitors[0].name, "PT Directory " + run, "search by booth number");
});

test("FR-078/079 attendance history and pass-ready email; FR-152 notification preference", async () => {
  const c = await customerSignup(`att-${run}@test.local`, "Attendance Person", undefined, {participant: false});
  ok(await c.patch("/api/customer/me", {fullName: "Attendance Person", notifyChannel: "WHATSAPP"}), 409, "WhatsApp needs verified phone");
  await completeParticipant(c, `att-${run}@test.local`, "Attendance Person");
  const reg = await c.post("/api/customer/registrations", {kind: "VISITOR", consent: true}); ok(reg, 201, "visitor");
  assert.equal(await db.notificationOutbox.count({where: {topic: "PASS_READY", dedupeKey: "pass-ready:" + reg.body.id}}), 1, "pass-ready email queued");
  ok(await c.patch("/api/customer/me", {fullName: "Attendance Person", notifyChannel: "EMAIL"}), 200, "email preference");
  assert.deepEqual((await c.get("/api/customer/attendance")).body.attendance, [], "no attendance yet");
  S.ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  await db.event.update({where: {id: S.ev.id}, data: {startsAt: new Date(Date.now() - 3600000)}});
  const g = await R.OPERATIONS.post("/api/admin/gates", {code: "AT" + run, name: "Attendance gate", zones: ["EXPO_ENTRY"]}); ok(g, 201, "gate");
  const code = (await c.get("/api/customer/passes")).body.passes[0].manualCode;
  ok(await R.SUPER_ADMIN.post("/api/admin/check-in/scan", {token: code, gate: "AT" + run, zone: "EXPO_ENTRY"}), 200, "admitted");
  const att = (await c.get("/api/customer/attendance")).body.attendance;
  assert.equal(att.length, 1); assert.equal(att[0].zone, "EXPO_ENTRY"); assert.ok(!JSON.stringify(att).match(/admittedBy|gate/), "no staff/gate details");
});

test("FR-155 waitlist: only when full, idempotent, manual release re-checks capacity", async () => {
  const ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  const conf = await db.conference.create({data: {eventId: ev.id, title: "Tiny " + run, slug: "tiny-" + run, published: true, feeMinor: 0n, capacity: 1}});
  const a = await customerSignup(`wa-${run}@test.local`, "Seat Holder"), b = await customerSignup(`wb-${run}@test.local`, "Waiting Person");
  ok(await b.post("/api/customer/waitlist", {conferenceId: conf.id}), 409, "not full yet");
  const ra = await a.post("/api/customer/registrations", {kind: "CONFERENCE", conferenceId: conf.id, consent: true}); ok(ra, 201, "A takes seat");
  ok(await b.post("/api/customer/registrations", {kind: "CONFERENCE", conferenceId: conf.id, consent: true}), 409, "full");
  const w = await b.post("/api/customer/waitlist", {conferenceId: conf.id}); ok(w, 201, "waitlist"); assert.equal(w.body.position, 1);
  ok(await b.post("/api/customer/waitlist", {conferenceId: conf.id}), 201, "idempotent");
  ok(await a.post("/api/customer/waitlist", {conferenceId: conf.id}), 409, "registered person cannot wait");
  ok(await R.SALES.post(`/api/admin/waitlist/${w.body.id}/release`, {reason: "sales attempt"}), 403, "sales release");
  ok(await R.OPERATIONS.post(`/api/admin/waitlist/${w.body.id}/release`, {reason: "No seat yet attempt"}), 409, "still full");
  await db.enrollment.update({where: {id: ra.body.id}, data: {status: "CANCELLED"}});
  const rel = await R.OPERATIONS.post(`/api/admin/waitlist/${w.body.id}/release`, {reason: "Seat released after cancellation"}); ok(rel, 201, "released");
  assert.equal((await db.enrollment.findUnique({where: {id: rel.body.enrollmentId}})).status, "SUBMITTED");
  const q = await R.OPERATIONS.get(`/api/admin/conferences/${conf.id}/waitlist`); ok(q, 200, "queue"); assert.equal(q.body.entries[0].status, "OFFERED");
});
