import {test} from "node:test";
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {crmEnabledFor, crmSignature, crmTarget, deliverCrm} from "../src/lib/crm-sync";

const env = (vars: Record<string, string | undefined>, fn: () => unknown) => { const old = {...process.env}; Object.assign(process.env, vars); for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k]; try { return fn(); } finally { process.env = old; } };

test("CRM sync is off by default and entity-scoped", () => {
  env({CRM_WEBHOOK_URL: undefined}, () => assert.equal(crmEnabledFor("LEAD"), false));
  env({CRM_WEBHOOK_URL: "https://crm.example/hook", CRM_SYNC_ENTITIES: undefined}, () => { assert.equal(crmEnabledFor("LEAD"), true); assert.equal(crmEnabledFor("ENROLLMENT"), false); });
  env({CRM_WEBHOOK_URL: "https://crm.example/hook", CRM_SYNC_ENTITIES: "lead, enrollment"}, () => assert.equal(crmEnabledFor("ENROLLMENT"), true));
});

test("CRM target must be https (loopback http only when explicitly allowed)", () => {
  env({CRM_WEBHOOK_URL: "http://crm.example/hook"}, () => assert.throws(() => crmTarget(), /https/));
  env({CRM_WEBHOOK_URL: "http://127.0.0.1:9/x", CRM_WEBHOOK_ALLOW_LOCAL_HTTP: undefined}, () => assert.throws(() => crmTarget(), /https/));
  env({CRM_WEBHOOK_URL: "http://127.0.0.1:9/x", CRM_WEBHOOK_ALLOW_LOCAL_HTTP: "true"}, () => assert.equal(crmTarget().port, "9"));
});

test("delivery is signed, idempotent-keyed, and throws on non-2xx for retry", async () => {
  const secret = "s".repeat(32);
  const fakeDb = {lead: {findUnique: async () => ({leadType: "PARTNER", name: "A", email: "a@x.co", company: null, phone: null, message: "m", status: "NEW", consentVersion: "v1", consentAt: new Date(0), utmSource: null, utmMedium: null, utmCampaign: null, createdAt: new Date(0), ipHash: "secret-hash"})}} as never;
  let seen: {body: string; headers: Record<string, string>} | null = null;
  const ok = (async (_u: URL, init: RequestInit) => { seen = {body: String(init.body), headers: init.headers as Record<string, string>}; return new Response("{}", {status: 200}); }) as typeof fetch;
  await env({CRM_WEBHOOK_URL: "https://crm.example/hook", CRM_WEBHOOK_SECRET: secret}, () => deliverCrm(fakeDb, {entity: "LEAD", id: "L1", event: "created"}, "crm:LEAD:L1:created", ok));
  const s = seen!;
  assert.equal(s.headers["Idempotency-Key"], "crm:LEAD:L1:created");
  assert.equal(s.headers["X-IMDX-Signature"], "sha256=" + createHmac("sha256", secret).update(s.headers["X-IMDX-Timestamp"] + "." + s.body).digest("hex"));
  assert.equal(crmSignature(secret, s.headers["X-IMDX-Timestamp"], s.body), s.headers["X-IMDX-Signature"]);
  assert.ok(!s.body.includes("secret-hash"), "purpose-limited fields only");
  const bad = (async () => new Response("no", {status: 500})) as typeof fetch;
  await assert.rejects(env({CRM_WEBHOOK_URL: "https://crm.example/hook", CRM_WEBHOOK_SECRET: secret}, () => deliverCrm(fakeDb, {entity: "LEAD", id: "L1"}, "k", bad)) as Promise<void>, /500/);
  await assert.rejects(env({CRM_WEBHOOK_URL: "https://crm.example/hook", CRM_WEBHOOK_SECRET: "short"}, () => deliverCrm(fakeDb, {entity: "LEAD", id: "L1"}, "k", ok)) as Promise<void>, /SECRET/);
});

test("FR-159 estimator: per-m² with rounding/minimum, package suggestion, unknown category", async () => {
  const {estimate, tariffSchema} = await import("../src/lib/fee-estimator");
  const t = tariffSchema.parse({categories: [{name: "Standard", perSqmMinor: "3500000", minimumSqm: 9}, {name: "Premium", perSqmMinor: "4250000"}],
    packages: [{name: "Shell 9", maxSqm: 9, priceMinor: "30000000"}, {name: "Shell 18", maxSqm: 18, priceMinor: "58000000"}], approvedBy: "Organizer", approvedAt: "2026-11-01"});
  const a = estimate(t, 4, "standard")!;
  assert.equal(a.pricedSqm, 9); assert.equal(a.minimumApplied, true); assert.equal(a.estimateMinor, "31500000"); assert.equal(a.package?.name, "Shell 9");
  const b = estimate(t, 12.2, "Premium")!;
  assert.equal(b.pricedSqm, 12.5); assert.equal(b.estimateMinor, "53125000"); assert.equal(b.package?.name, "Shell 18");
  assert.equal(estimate(t, 40, "Premium")!.package, null);
  assert.equal(estimate(t, 10, "Unknown"), null);
  assert.throws(() => tariffSchema.parse({categories: [{name: "X", perSqmMinor: "-1"}], approvedBy: "O", approvedAt: "2026-11-01"}));
});
