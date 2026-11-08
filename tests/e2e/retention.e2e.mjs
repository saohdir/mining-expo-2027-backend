// FR-150: retention rules — nothing purged without a policy; minimums enforced; dry run counts; purge/anonymise; audit.
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const old = new Date(Date.now() - 400 * 86400000);
test.after(() => db.$disconnect());

test("FR-150: retention lifecycle", async () => {
  const SA = await adminLogin("SUPER_ADMIN"), OPS = await adminLogin("OPERATIONS");
  await SA.req("PUT", "/api/admin/retention", {policy: null, reason: "Reset before E2E run"});
  ok(await OPS.get("/api/admin/retention"), 403, "super admin only");
  const fresh = await db.lead.create({data: {leadType: "CONTACT", name: "Fresh " + run, email: `fresh-${run}@test.local`, message: "fresh closed lead", consentVersion: "v1", consentAt: new Date(), status: "CLOSED"}});
  const stale = await db.lead.create({data: {leadType: "CONTACT", name: "Stale " + run, email: `stale-${run}@test.local`, phone: "+620000", message: "old closed lead", consentVersion: "v1", consentAt: old, status: "CLOSED"}});
  await db.$executeRaw`UPDATE "Lead" SET "updatedAt" = ${old} WHERE id = ${stale.id}`;
  const att = await db.loginAttempt.create({data: {emailHash: "h-" + run, ipHash: "ip-" + run, success: false, createdAt: old}});
  const scan = await db.passScan.create({data: {gate: "X", zone: "EXPO_ENTRY", result: "INVALID", scannedBy: "e2e", createdAt: old}});
  const g = (await SA.get("/api/admin/retention")).body; assert.equal(g.policy, null); assert.equal(g.preview, null, "no policy → nothing previewed/purged");
  ok(await SA.post("/api/admin/retention", {confirm: "PURGE", reason: "Run without policy"}), 409, "no policy");
  ok(await SA.req("PUT", "/api/admin/retention", {policy: {rules: {CLOSED_LEADS: 5}, approvedBy: "Legal", approvedAt: "2026-11-01"}, reason: "Below the minimum"}), 400, "minimum enforced");
  ok(await SA.req("PUT", "/api/admin/retention", {policy: {rules: {CLOSED_LEADS: 365, AUTH_ARTIFACTS: 30, REJECTED_SCANS: 90}, approvedBy: "Legal (D-13)", approvedAt: "2026-11-01"}, reason: "Approved retention schedule"}), 200, "save");
  const p = (await SA.get("/api/admin/retention")).body.preview;
  assert.ok(p.CLOSED_LEADS >= 1 && p.AUTH_ARTIFACTS >= 1 && p.REJECTED_SCANS >= 1, JSON.stringify(p));
  assert.equal(await db.lead.count({where: {id: stale.id, email: `stale-${run}@test.local`}}), 1, "dry run changes nothing");
  ok(await SA.post("/api/admin/retention", {confirm: "yes", reason: "Wrong confirmation"}), 400, "must type PURGE");
  const r = await SA.post("/api/admin/retention", {confirm: "PURGE", reason: "Apply approved schedule"}); ok(r, 200, "purge");
  const s2 = await db.lead.findUnique({where: {id: stale.id}});
  assert.equal(s2.name, "Anonymised"); assert.equal(s2.phone, null); assert.ok(s2.email.endsWith("@anonymised.invalid")); assert.equal(s2.status, "CLOSED", "record kept for statistics");
  assert.equal((await db.lead.findUnique({where: {id: fresh.id}})).email, `fresh-${run}@test.local`, "recent lead untouched");
  assert.equal(await db.loginAttempt.count({where: {id: att.id}}), 0); assert.equal(await db.passScan.count({where: {id: scan.id}}), 0);
  assert.ok(await db.auditLog.count({where: {action: "RETENTION_PURGE_RUN"}}) >= 1);
  assert.ok(await db.auditLog.count() > 0, "audit log is never purged");
  ok(await SA.req("PUT", "/api/admin/retention", {policy: null, reason: "Cleanup after E2E run"}), 200, "remove policy");
});
