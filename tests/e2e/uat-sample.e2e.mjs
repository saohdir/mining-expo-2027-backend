// UAT sample data: after scripts/seed-uat-sample-data.ts a customer can register as visitor, book a paid conference
// (manual invoice with the dummy bank account) and request a booth; sample content is public; --remove cleans up.
import {test} from "node:test";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup, Client} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const seed = (...a) => execFileSync("npx", ["tsx", "scripts/seed-uat-sample-data.ts", "--confirm", ...a], {stdio: "pipe", env: process.env}).toString();
test.after(() => db.$disconnect());

test("sample data makes visitor, conference and booth flows usable", async () => {
  const out = seed(); assert.match(out, /programmes published/);
  const anon = new Client("anon");
  const ev = (await anon.get("/api/public/events")).body.events.find(e => e.code === "IMDX-2027");
  assert.ok(ev, "event public");
  const paid = ev.conferences.find(c => c.slug === "mining-downstream-green-mining");
  assert.equal(paid.registrationState, "AVAILABLE"); assert.equal(paid.admissionMode, "MANUAL_INVOICE");
  assert.equal((await anon.get("/api/public/floorplan")).body.state, "PUBLISHED");
  const partners = (await anon.get("/api/public/content?kind=PARTNER&locale=zh")).body.items;
  assert.ok(partners.some(p => p.slug === "sample-partner-1" && /示例/.test(p.title)), "Chinese sample partners");
  assert.ok((await anon.get("/api/public/content?kind=DOWNLOAD")).body.items.some(d => d.url === "/assets/samples/exhibitor-manual-sample.pdf"));
  assert.equal((await anon.get("/api/public/estimate?area=12&category=Standard")).body.estimateMinor, "42000000");

  const c = await customerSignup(`sample-${run}@test.local`, "Sample Customer");
  ok(await c.post("/api/customer/registrations", {kind: "VISITOR", consent: true}), 201, "visitor registration");
  const reg = await c.post("/api/customer/registrations", {kind: "CONFERENCE", conferenceId: paid.id, consent: true}); ok(reg, 201, "conference booking");
  ok(await c.post("/api/customer/manual-payment-request", {enrollmentId: reg.body.id}), 201, "invoice request");
  const plan = (await anon.get("/api/public/floorplan")).body;
  const unit = plan.units.find(u => u.status === "AVAILABLE");
  const booth = await c.post("/api/customer/booth-requests", {floorplanId: plan.id, preferredUnitIds: [unit.id], requestedAreaSqm: Number(unit.areaSqm), company: "Sample Customer Co", consent: true});
  ok(booth, 201, "booth request");
  const FIN = await adminLogin("FINANCE");
  const me = (await c.get("/api/customer/me")).body;
  const inv = await FIN.post("/api/admin/invoices", {accountId: me.id, enrollmentId: reg.body.id, items: [{description: "Conference seat (sample price)", quantity: 1, unitPriceMinor: "2500000"}]});
  ok(inv, 201, "invoice draft"); ok(await FIN.post(`/api/admin/invoices/${inv.body.id}/issue`, {}), 200, "issue");
  const mine = (await c.get("/api/customer/invoices")).body.invoices.find(i => i.id === inv.body.id);
  assert.ok(mine, "customer sees the invoice");
  const pdf = await fetch(process.env.E2E_BASE_URL + `/api/customer/invoices/${inv.body.id}/pdf`, {headers: {cookie: [...c.jar].map(([k, v]) => k + "=" + v).join("; ")}});
  assert.equal(pdf.status, 200, "invoice PDF with (dummy) bank details");

  seed("--remove");
  assert.equal((await anon.get("/api/public/content?kind=PARTNER")).body.items.some(p => p.slug?.startsWith("sample-")), false, "sample content removed");
});
