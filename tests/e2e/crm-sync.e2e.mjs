// FR-032 (P2): lead → outbox → signed CRM webhook (local receiver), retried until the CRM answers 2xx.
import {test} from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {createHmac} from "node:crypto";
import {PrismaClient} from "@prisma/client";
import {BASE} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const SECRET = "local-test-only-crm-secret-0123456789abcdef";
const got = [];
let failFirst = true;
const server = http.createServer((req, res) => { let b = ""; req.on("data", c => b += c); req.on("end", () => {
  if (failFirst) { failFirst = false; res.writeHead(503).end(); return; }
  got.push({headers: req.headers, body: b}); res.writeHead(200, {"content-type": "application/json"}).end("{}"); }); });
test.before(() => new Promise(r => server.listen(3198, "127.0.0.1", r)));
test.after(async () => { server.close(); await db.$disconnect(); });

test("FR-032: lead is delivered once, signed, after a retry", {timeout: 90000}, async () => {
  if (!process.env.CRM_WEBHOOK_URL) return;
  const r = await fetch(BASE + "/api/public/leads", {method: "POST", headers: {"content-type": "application/json", origin: BASE, "x-forwarded-for": "203.0.113." + (Date.now() % 200)},
    body: JSON.stringify({leadType: "PARTNER", name: "CRM Lead", email: `crm-${run}@test.local`, message: "Partnership enquiry for CRM sync", consent: true})});
  assert.equal(r.status, 201);
  const lead = await db.lead.findFirstOrThrow({where: {email: `crm-${run}@test.local`}});
  const job = await db.notificationOutbox.findUniqueOrThrow({where: {dedupeKey: "crm:LEAD:" + lead.id + ":created"}});
  // First attempt gets 503 → FAILED with backoff; pull the retry forward instead of waiting 30–60 s.
  for (let i = 0; i < 60 && (await db.notificationOutbox.findUnique({where: {id: job.id}})).attempts < 1; i++) await new Promise(s => setTimeout(s, 500));
  await db.notificationOutbox.update({where: {id: job.id}, data: {nextRunAt: new Date()}});
  for (let i = 0; i < 60 && !got.some(g => g.body.includes(lead.id)); i++) await new Promise(s => setTimeout(s, 500));
  const hit = got.find(g => g.body.includes(lead.id));
  assert.ok(hit, "delivered after retry");
  const body = JSON.parse(hit.body);
  assert.equal(body.entity, "LEAD"); assert.equal(body.record.email, `crm-${run}@test.local`); assert.equal(body.record.ipHash, undefined);
  assert.equal(hit.headers["idempotency-key"], job.dedupeKey);
  assert.equal(hit.headers["x-imdx-signature"], "sha256=" + createHmac("sha256", SECRET).update(hit.headers["x-imdx-timestamp"] + "." + hit.body).digest("hex"));
  const done = await db.notificationOutbox.findUnique({where: {id: job.id}});
  assert.equal(done.state, "SENT"); assert.equal(done.attempts, 2);
});
