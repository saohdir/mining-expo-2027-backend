// Prospect report (next edition): one row per person who registered as visitor / conference delegate / exhibitor.
// Contact data limited to Super Admin / Sales / Operations; everyone who registered is included (no separate opt-in).
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

test("prospects: everyone who registered is included; RBAC, filters, summary and Excel export", async () => {
  ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  await db.event.update({where: {id: ev.id}, data: {published: true, visitorOpen: true}});
  const a = await customerSignup(`pr-a-${run}@test.local`, "Prospek A " + run);
  const b = await customerSignup(`pr-b-${run}@test.local`, "Prospek B " + run);
  ok(await a.post("/api/customer/registrations", {kind: "VISITOR", consent: true}), 201, "visitor a");
  ok(await b.post("/api/customer/registrations", {kind: "VISITOR", consent: true}), 201, "visitor b");

  ok(await (await adminLogin("VIEWER")).get("/api/admin/reports/prospects"), 403, "viewer has no contact data");
  ok(await (await adminLogin("FINANCE")).get("/api/admin/reports/prospects"), 403, "finance has no prospect data");
  const SALES = await adminLogin("SALES");
  const q = "&q=" + run;
  const def = await SALES.get("/api/admin/reports/prospects?type=VISITOR" + q); ok(def, 200, "sales");
  assert.deepEqual(def.body.rows.map(r => r.email).sort(), [`pr-a-${run}@test.local`, `pr-b-${run}@test.local`], "no opt-in needed");
  const r0 = def.body.rows[0];
  assert.ok(r0.roles.includes("Visitor")); assert.ok(r0.whatsapp.startsWith("+62"), "verified WhatsApp");
  assert.equal(def.body.summary.people, 2);
  assert.equal(def.body.summary.byRole.find(x => x.label === "Visitor").count, 2);
  const conf = await SALES.get("/api/admin/reports/prospects?type=CONFERENCE" + q); ok(conf, 200, "conf");
  assert.equal(conf.body.total, 0, "type filter");
  const att = await SALES.get("/api/admin/reports/prospects?attended=yes" + q);
  assert.equal(att.body.total, 0, "nobody checked in yet");

  const cookie = [...SALES.jar].map(([k, v]) => k + "=" + v).join("; ");
  const x = await fetch(BASE + "/api/admin/reports/prospects?format=xlsx" + q, {headers: {cookie}});
  assert.equal(x.status, 200);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await x.arrayBuffer())); const ws = wb.worksheets[0];
  assert.match(String(ws.getRow(1).getCell(1).value), /all registered participants/);
  const head = ws.getRow(2).values.filter(Boolean);
  for (const h of ["Salutation", "Name", "Job title", "Company", "Email", "WhatsApp", "Participated as", "Attended"]) assert.ok(head.includes(h), "column " + h);
  assert.ok(!head.includes("Future-contact consent"));
  assert.equal(ws.rowCount, 4, "header rows + 2 people");
  assert.ok(await db.auditLog.findFirst({where: {action: "PROSPECTS_EXPORTED", createdAt: {gte: new Date(Date.now() - 60000)}}}), "export audited");
});
