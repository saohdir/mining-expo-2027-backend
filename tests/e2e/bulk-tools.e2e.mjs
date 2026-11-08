// FR-154: CSV pre-registration (dry run → invitations → own account → pass) and badge PDF printing.
import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup, MAIL, qp, BASE} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const R = {};
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const inviteToken = email => {
  const lines = fs.readFileSync(MAIL, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].to.includes(email)) { const m = qp(lines[i].body).match(/invitation\?token=([A-Za-z0-9_%-]+)/); if (m) return decodeURIComponent(m[1]); }
  throw new Error("no invitation for " + email);
};
test.after(() => db.$disconnect());

test("FR-154: dry run validates and dedupes; import sends invitations; RBAC; acceptance issues pass", async () => {
  for (const r of ["OPERATIONS", "SALES", "VIEWER"]) R[r] = await adminLogin(r);
  const ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  if (!ev.published || !ev.visitorOpen) await db.event.update({where: {id: ev.id}, data: {published: true, visitorOpen: true}});
  const existing = await customerSignup(`pre-existing-${run}@test.local`, "Already Here");
  ok(await existing.post("/api/customer/registrations", {kind: "VISITOR", consent: true}), 201, "existing visitor");
  const csv = `email,full_name,organization,job_title\npre1-${run}@test.local,"Budi, Santoso",PT Satu,Engineer\npre2-${run}@test.local,Dewi Lestari,,\nnot-an-email,X Y,,\npre-existing-${run}@test.local,Already Here,,\n`;
  ok(await R.SALES.post("/api/admin/preregistrations", {csv, dryRun: true, reason: "sales attempt here"}), 403, "sales cannot import");
  const dry = await R.OPERATIONS.post("/api/admin/preregistrations", {csv, dryRun: true, reason: "Partner delegation list"}); ok(dry, 200, "dry run");
  assert.equal(dry.body.valid, 3); assert.equal(dry.body.toInvite, 2); assert.deepEqual(dry.body.skipped.map(s => s.reason), ["ALREADY_REGISTERED"]); assert.deepEqual(dry.body.errors.map(e => e.line), [4]);
  assert.equal(await db.invitation.count({where: {kind: "PREREGISTERED_VISITOR", email: {contains: run}}}), 0, "dry run writes nothing");
  ok(await R.OPERATIONS.post("/api/admin/preregistrations", {csv, dryRun: false, reason: "Partner delegation list"}), 400, "errors block import");
  const clean = csv.split("\n").filter(l => !l.startsWith("not-an-email")).join("\n");
  const imp = await R.OPERATIONS.post("/api/admin/preregistrations", {csv: clean, dryRun: false, reason: "Partner delegation list"}); ok(imp, 200, "import");
  assert.equal(imp.body.sent, 2);
  const again = await R.OPERATIONS.post("/api/admin/preregistrations", {csv: clean, dryRun: true, reason: "Partner delegation list"});
  assert.equal(again.body.toInvite, 0, "re-import does not double-invite");
  assert.equal((await db.auditLog.count({where: {action: "PREREGISTRATION_IMPORTED"}})) >= 1, true);
  await new Promise(s => setTimeout(s, 300));
  const c = await customerSignup(`pre1-${run}@test.local`, "Budi Santoso");
  assert.equal((await c.get("/api/customer/passes")).body.passes.length, 0, "no pass before accepting");
  ok(await c.post("/api/customer/invitations/accept", {token: inviteToken(`pre1-${run}@test.local`)}), 200, "accept");
  assert.deepEqual((await c.get("/api/customer/passes")).body.passes.map(p => p.entitlement), ["EXPO_ENTRY"]);
  const list = (await R.VIEWER.get("/api/admin/preregistrations")).body.invitations;
  const pre2 = list.find(i => i.email === `pre2-${run}@test.local`);
  ok(await R.VIEWER.post("/api/admin/invitations/" + pre2.id + "/revoke", {reason: "viewer attempt"}), 403, "viewer cannot revoke");
  ok(await R.OPERATIONS.post("/api/admin/invitations/" + pre2.id + "/revoke", {reason: "Person declined by phone"}), 200, "revoke");
  const c2 = await customerSignup(`pre2-${run}@test.local`, "Dewi Lestari");
  ok(await c2.post("/api/customer/invitations/accept", {token: inviteToken(`pre2-${run}@test.local`)}), 409, "revoked invitation");
});

test("FR-154: badge counts and A6 PDF (audited, ops only)", async () => {
  const counts = await R.OPERATIONS.get("/api/admin/badges"); ok(counts, 200, "counts");
  assert.ok(counts.body.byCategory.VISITOR >= 2);
  ok(await R.VIEWER.get("/api/admin/badges?format=pdf"), 403, "viewer cannot print");
  ok(await R.OPERATIONS.get("/api/admin/badges?category=NOPE"), 400, "bad category");
  const cookie = [...R.OPERATIONS.jar].map(([k, v]) => k + "=" + v).join("; ");
  const pdf = await fetch(BASE + "/api/admin/badges?format=pdf&category=VISITOR", {headers: {cookie}});
  assert.equal(pdf.status, 200); assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
  assert.ok(await db.auditLog.count({where: {action: "BADGES_PRINTED"}}) >= 1);
});
