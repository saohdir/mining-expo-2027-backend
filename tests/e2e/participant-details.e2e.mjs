// Participant forms: visitor/conference need salutation, name, job, company, sign-up email and a WhatsApp number verified
// by OTP (SMS or WhatsApp); exhibitors give company, PIC, verified PIC WhatsApp, products, indoor/outdoor, optional custom size.
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup, lastOtp, BASE} from "./lib.mjs";

const ExcelJS = createRequire(import.meta.url)("exceljs");
const db = new PrismaClient();
const run = Date.now().toString(36);
const S = {};
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
test.after(async () => { if (S.ev) await db.event.update({where: {id: S.ev.id}, data: {published: S.ev.published, visitorOpen: S.ev.visitorOpen}}); await db.$disconnect(); });

test("visitor + conference require complete details and a verified WhatsApp number", async () => {
  S.ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  await db.event.update({where: {id: S.ev.id}, data: {published: true, visitorOpen: true}});
  const c = await customerSignup(`pd-${run}@test.local`, "Budi Santoso", undefined, {participant: false});
  const r0 = await c.post("/api/customer/registrations", {kind: "VISITOR", consent: true}); ok(r0, 400, "incomplete");
  assert.match(r0.body.message, /salutation.*jobTitle.*organization.*whatsapp/);
  ok(await c.req("PATCH", "/api/customer/me", {salutation: "SIR", fullName: "Budi Santoso"}), 400, "salutation must be Bapak/Ibu");
  ok(await c.req("PATCH", "/api/customer/me", {salutation: "BAPAK", fullName: "Budi Santoso", jobTitle: "Mine Manager", organization: "PT Tambang Contoh"}), 200, "details");
  ok(await c.post("/api/customer/contact-change", {channel: "WHATSAPP", value: "12345"}), 400, "invalid number");
  const ch = await c.post("/api/customer/contact-change", {channel: "WHATSAPP", value: "0812-" + run.slice(-4).replace(/\D/g, "7").padStart(4, "7") + "-9" + String(Date.now()).slice(-3)});
  ok(ch, 200, "WhatsApp OTP");
  const acct = await db.otpChallenge.findUniqueOrThrow({where: {id: ch.body.challengeId}});
  assert.match(acct.newDestination, /^\+62812\d{8}$/, "0812… normalised to +62812…");
  await new Promise(s => setTimeout(s, 200));
  ok(await c.post("/api/customer/contact-change/verify", {challengeId: ch.body.challengeId, code: lastOtp(acct.newDestination.slice(1) + "@whatsapp.uat.invalid")}), 200, "verified");
  const v = await c.post("/api/customer/registrations", {kind: "VISITOR", consent: true}); ok(v, 201, "visitor");
  const snap = (await db.enrollment.findUniqueOrThrow({where: {id: v.body.id}})).profileSnapshot;
  assert.deepEqual([snap.salutation, snap.jobTitle, snap.organization, snap.email, snap.whatsapp], ["BAPAK", "Mine Manager", "PT Tambang Contoh", `pd-${run}@test.local`, acct.newDestination]);
  S.cust = c;
});

test("exhibitor request: PIC, products, indoor/outdoor, custom size; location must match the booth", async () => {
  const OPS = await adminLogin("OPERATIONS");
  const p = await OPS.post("/api/admin/floorplans", {title: "PD plan " + run, canvasWidth: 1000, canvasHeight: 600}); ok(p, 201, "draft plan");
  const cat = await db.boothCategory.findFirstOrThrow({where: {eventId: S.ev.id}});
  const mk = (code, hall, x) => ({floorplanId: p.body.plan.id, code, category: cat.name, categoryId: cat.id, hall, x, y: 10, w: 30, h: 30, areaSqm: 9, lengthM: 3, widthM: 3, status: "AVAILABLE", placed: true});
  await db.boothUnit.createMany({data: [mk("PD-IN1", "A", 10), mk("PD-OUT1", "Outdoor", 100)]});
  const prevPub = await db.floorplan.findFirst({where: {eventId: S.ev.id, status: "PUBLISHED"}});
  if (prevPub) await db.floorplan.update({where: {id: prevPub.id}, data: {status: "ARCHIVED"}});
  await db.floorplan.update({where: {id: p.body.plan.id}, data: {status: "PUBLISHED", publishedAt: new Date()}});
  try {
    const units = await db.boothUnit.findMany({where: {floorplanId: p.body.plan.id}});
    const indoor = units.find(u => u.code === "PD-IN1"), outdoor = units.find(u => u.code === "PD-OUT1");
    const base = {floorplanId: p.body.plan.id, requestedAreaSqm: 9, company: "PT Pameran Contoh", picName: "Siti PIC", products: "Excavators and crushers", consent: true};
    ok(await S.cust.post("/api/customer/booth-requests", {...base, preferredUnitIds: [indoor.id], location: "INDOOR", products: ""}), 400, "products required");
    ok(await S.cust.post("/api/customer/booth-requests", {...base, preferredUnitIds: [indoor.id], location: "OUTDOOR"}), 400, "indoor booth with outdoor choice");
    ok(await S.cust.post("/api/customer/booth-requests", {...base, preferredUnitIds: [], location: "INDOOR"}), 400, "booth or custom size required");
    const a = await S.cust.post("/api/customer/booth-requests", {...base, preferredUnitIds: [outdoor.id], location: "OUTDOOR"}); ok(a, 201, "outdoor request");
    // The customer page no longer asks indoor/outdoor: without a location it is derived from the chosen booths.
    const n = await S.cust.post("/api/customer/booth-requests", {...base, preferredUnitIds: [outdoor.id], notes: "no location"}); ok(n, 201, "request without indoor/outdoor choice");
    assert.equal((await db.boothRequest.findUnique({where: {id: n.body.id}})).companySnapshot.location, "OUTDOOR", "location derived from booth");
    const b = await S.cust.post("/api/customer/booth-requests", {...base, preferredUnitIds: [], location: "INDOOR", customSize: "10 × 12 m", requestedAreaSqm: 120, notes: "custom"}); ok(b, 201, "custom size only");
    const cs = (await db.boothRequest.findUniqueOrThrow({where: {id: b.body.id}})).companySnapshot;
    assert.deepEqual([cs.name, cs.contactName, cs.products, cs.location, cs.customSize, !!cs.picWhatsapp], ["PT Pameran Contoh", "Siti PIC", "Excavators and crushers", "INDOOR", "10 × 12 m", true]);
    const nophone = await customerSignup(`pd-nophone-${run}@test.local`, "No Phone", undefined, {participant: false});
    ok(await nophone.post("/api/customer/booth-requests", {...base, preferredUnitIds: [indoor.id], location: "INDOOR"}), 400, "PIC WhatsApp must be verified");
    // Reports carry the new columns.
    const SA = await adminLogin("SUPER_ADMIN"), cookie = [...SA.jar].map(([k, v]) => k + "=" + v).join("; ");
    const read = async q => { const r = await fetch(BASE + "/api/admin/reports/export?" + q, {headers: {cookie}}); assert.equal(r.status, 200, q); const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await r.arrayBuffer())); return wb.worksheets[0]; };
    const reg = await read("dataset=registrations&basis=created&format=xlsx");
    const head = reg.getRow(2).values.filter(Boolean);
    for (const h of ["Salutation", "Job title", "Email", "WhatsApp"]) assert.ok(head.includes(h), "registrations column " + h);
    const booth = await read("dataset=booths&basis=created&format=xlsx");
    const bh = booth.getRow(2).values.filter(Boolean);
    for (const h of ["PIC WhatsApp", "Products", "Indoor/Outdoor", "Custom size"]) assert.ok(bh.includes(h), "booth column " + h);
  } finally {
    await db.floorplan.update({where: {id: p.body.plan.id}, data: {status: "ARCHIVED"}});
    if (prevPub) await db.floorplan.update({where: {id: prevPub.id}, data: {status: "PUBLISHED"}});
  }
});
