// Prospect report (next edition): one row per person who registered as visitor / conference delegate / exhibitor.
// Contact data limited to Super Admin / Sales / Operations; exports default to people who opted in to future contact (UU PDP).
import {test} from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup, BASE} from "./lib.mjs";

const ExcelJS = createRequire(import.meta.url)("exceljs");
const db = new PrismaClient();
const run = Date.now().toString(36);
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
let ev;
test.after(async () => { if (ev) await db.event.update({where: {id: ev.id}, data: {published: ev.published, visitorOpen: ev.visitorOpen}}); await db.$disconnect(); });

test("prospects: RBAC, future-contact consent, filters, summary and Excel export", async () => {
  ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  await db.event.update({where: {id: ev.id}, data: {published: true, visitorOpen: true}});
  const yes = await customerSignup(`pr-yes-${run}@test.local`, "Prospek Setuju " + run);
  const no = await customerSignup(`pr-no-${run}@test.local`, "Prospek Menolak " + run);
  ok(await yes.post("/api/customer/registrations", {kind: "VISITOR", consent: true}), 201, "visitor yes");
  ok(await no.post("/api/customer/registrations", {kind: "VISITOR", consent: true}), 201, "visitor no");

  // Opt-in is separate and optional; withdrawing it clears the timestamp.
  const me = (await yes.get("/api/customer/me")).body;
  assert.equal(me.profile.futureContactOptIn, false, "default off");
  ok(await yes.req("PATCH", "/api/customer/me", {fullName: me.profile.fullName, futureContactOptIn: true}), 200, "opt in");
  const p1 = await db.customerProfile.findFirstOrThrow({where: {account: {email: `pr-yes-${run}@test.local`}}});
  assert.equal(p1.futureContactOptIn, true); assert.ok(p1.futureContactAt, "consent time recorded");
  ok(await no.req("PATCH", "/api/customer/me", {fullName: "Prospek Menolak " + run, futureContactOptIn: true}), 200, "no: opt in");
  ok(await no.req("PATCH", "/api/customer/me", {fullName: "Prospek Menolak " + run, futureContactOptIn: false}), 200, "no: withdraw");
  const p2 = await db.customerProfile.findFirstOrThrow({where: {account: {email: `pr-no-${run}@test.local`}}});
  assert.equal(p2.futureContactOptIn, false); assert.equal(p2.futureContactAt, null);

  ok(await (await adminLogin("VIEWER")).get("/api/admin/reports/prospects"), 403, "viewer has no contact data");
  ok(await (await adminLogin("FINANCE")).get("/api/admin/reports/prospects"), 403, "finance has no prospect data");
  const SALES = await adminLogin("SALES");
  const q = "&q=" + run;
  const def = await SALES.get("/api/admin/reports/prospects?type=VISITOR" + q); ok(def, 200, "sales");
  assert.deepEqual(def.body.rows.map(r => r.email), [`pr-yes-${run}@test.local`], "default = consented only");
  const r0 = def.body.rows[0];
  assert.equal(r0.consent, true); assert.ok(r0.roles.includes("Visitor")); assert.ok(r0.whatsapp.startsWith("+62"), "verified WhatsApp");
  const all = await SALES.get("/api/admin/reports/prospects?consent=all" + q); ok(all, 200, "all");
  assert.equal(all.body.total, 2);
  assert.equal(all.body.summary.people, 2); assert.equal(all.body.summary.consented, 1);
  assert.equal(all.body.summary.byRole.find(b => b.label === "Visitor").count, 2);
  const conf = await SALES.get("/api/admin/reports/prospects?type=CONFERENCE&consent=all" + q); ok(conf, 200, "conf");
  assert.equal(conf.body.total, 0, "type filter");
  const att = await SALES.get("/api/admin/reports/prospects?attended=yes&consent=all" + q);
  assert.equal(att.body.total, 0, "nobody checked in yet");

  const cookie = [...SALES.jar].map(([k, v]) => k + "=" + v).join("; ");
  const x = await fetch(BASE + "/api/admin/reports/prospects?format=xlsx" + q, {headers: {cookie}});
  assert.equal(x.status, 200);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await x.arrayBuffer())); const ws = wb.worksheets[0];
  assert.match(String(ws.getRow(1).getCell(1).value), /agreed to be contacted/);
  const head = ws.getRow(2).values.filter(Boolean);
  for (const h of ["Salutation", "Name", "Job title", "Company", "Email", "WhatsApp", "Participated as", "Future-contact consent"]) assert.ok(head.includes(h), "column " + h);
  assert.equal(ws.rowCount, 3, "header + 1 consented person");
  assert.ok(await db.auditLog.findFirst({where: {action: "PROSPECTS_EXPORTED", createdAt: {gte: new Date(Date.now() - 60000)}}}), "export audited");
});
