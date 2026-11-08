// FR-125: taxes/fees only when configured (Super Admin, audited); added as labelled lines on new drafts and revisions.
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
test.after(() => db.$disconnect());
const config = {approvedBy: "E2E Finance", approvedAt: "2026-11-01", charges: [
  {code: "VAT", label: "VAT", kind: "TAX", rateBps: 1100, appliesTo: ["BOOTH", "CONFERENCE"]},
  {code: "ADMIN", label: "Admin fee", kind: "FEE", fixedMinor: "25000", appliesTo: ["BOOTH"]}]};

test("FR-125: no charges by default; configured VAT line on conference draft; revision recomputes; config RBAC", async () => {
  const SA = await adminLogin("SUPER_ADMIN"), FIN = await adminLogin("FINANCE");
  const ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  if (!ev.published) await db.event.update({where: {id: ev.id}, data: {published: true}});
  const conf = await db.conference.create({data: {eventId: ev.id, title: "Charges programme " + run, slug: "chg-" + run, published: true, capacity: 10, feeMinor: 1000000n}});
  const c = await customerSignup(`chg-${run}@test.local`, "Tax Payer");
  const me = (await c.get("/api/customer/me")).body;
  const reg = async () => (await c.post("/api/customer/registrations", {kind: "CONFERENCE", conferenceId: conf.id, consent: true})).body.id;
  const enrollmentId = await reg();
  const draft = body => FIN.post("/api/admin/invoices", {accountId: me.id, enrollmentId, items: [{description: "Conference seat", quantity: 1, unitPriceMinor: "1000000"}], ...body});
  try {
    await SA.req("PUT", "/api/admin/invoice-charges", {config: null, reason: "Reset before E2E run"});
    const plain = await draft({}); ok(plain, 201, "draft without config");
    assert.equal(plain.body.totalMinor, "1000000", "nothing added when not configured");
    ok(await FIN.req("PUT", "/api/admin/invoice-charges", {config, reason: "finance attempt"}), 403, "finance cannot configure");
    ok(await SA.req("PUT", "/api/admin/invoice-charges", {config: {...config, approvedBy: ""}, reason: "Approved by Finance/Legal"}), 400, "approval reference required");
    ok(await SA.req("PUT", "/api/admin/invoice-charges", {config, reason: "Approved by Finance/Legal"}), 200, "configure");
    assert.equal((await FIN.get("/api/admin/invoice-charges")).body.config.charges.length, 2, "finance can read");
    const taxed = await draft({}); ok(taxed, 201, "draft with VAT");
    assert.equal(taxed.body.totalMinor, "1110000");
    const items = await db.invoiceItem.findMany({where: {invoiceId: taxed.body.id}, orderBy: {kind: "asc"}});
    assert.deepEqual(items.map(i => [i.kind, i.description, i.amountMinor.toString()]), [["ITEM", "Conference seat", "1000000"], ["TAX", "VAT (11%)", "110000"]], "booth-only fee not applied");
    assert.equal((await db.invoiceItem.count({where: {invoiceId: plain.body.id}})), 1, "existing draft untouched");
    ok(await FIN.post(`/api/admin/invoices/${taxed.body.id}/issue`, {}), 200, "issue");
    const rev = await FIN.post(`/api/admin/invoices/${taxed.body.id}/revise`, {reason: "Seat price corrected by sales", items: [{description: "Conference seat", quantity: 2, unitPriceMinor: "1000000"}]});
    ok(rev, 201, "revise"); assert.equal(rev.body.totalMinor, "2220000", "VAT recomputed on new subtotal");
    assert.ok(await db.auditLog.count({where: {action: "INVOICE_CHARGES_CHANGED"}}) >= 2);
  } finally { await SA.req("PUT", "/api/admin/invoice-charges", {config: null, reason: "Cleanup after E2E run"}); }
});
