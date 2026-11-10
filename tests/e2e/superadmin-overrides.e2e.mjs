// Super Admin can do everything after an explicit warning: overridable business rules accept `override: true` from a
// Super Admin only (other roles stay blocked), each override is audited; integrity rules stay (last Super Admin).
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, customerSignup, Client} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
const S = {};
test.after(async () => {
  if (S.ev) await db.event.update({where: {id: S.ev.id}, data: {published: S.ev.published, visitorOpen: S.ev.visitorOpen}});
  if (S.booth) await db.boothRequest.update({where: {id: S.booth.id}, data: {status: S.booth.status}});
  await db.$disconnect();
});

test("Super Admin overrides: staff self-change, policy confirmations, forced booth status, own mailout", {timeout: 60000}, async () => {
  const [SA, OPS] = await Promise.all([adminLogin("SUPER_ADMIN"), adminLogin("OPERATIONS")]);

  // Staff: create a second Super Admin, reset its password, it may lock itself out only with override.
  const email = `sa2-${run}@test.local`, pw = "Temporary-Pass-" + run;
  const created = await SA.post("/api/admin/staff", {email, role: "SUPER_ADMIN", temporaryPassword: pw, reason: "E2E second super admin"}); ok(created, 201, "create staff");
  const sa2id = created.body.id;
  const newPw = "Reset-Password-" + run;
  ok(await SA.patch("/api/admin/staff/" + sa2id, {newPassword: newPw, reason: "E2E password reset"}), 200, "reset password");
  const sa2 = new Client("sa2"); ok(await sa2.post("/api/admin/auth/login", {email, password: newPw}), 200, "login with reset password");
  ok(await sa2.patch("/api/admin/staff/" + sa2id, {active: false, reason: "Leaving the project"}), 409, "self lockout needs override");
  ok(await sa2.patch("/api/admin/staff/" + sa2id, {active: false, reason: "Leaving the project", override: true}), 200, "self deactivate with override");
  assert.ok(await db.auditLog.findFirst({where: {resourceId: sa2id, action: "STAFF_SELF_CHANGE_OVERRIDE"}}));
  ok(await SA.patch("/api/admin/staff/" + sa2id, {active: true, reason: "E2E restore account"}), 200, "reactivate");
  ok(await SA.patch("/api/admin/staff/" + sa2id, {active: false, reason: "E2E cleanup account"}), 200, "cleanup");

  // Registration policy: a pending visitor registration can be confirmed by Super Admin with override only.
  S.ev = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  await db.event.update({where: {id: S.ev.id}, data: {published: true, visitorOpen: true}});
  const cust = await customerSignup(`ovr-${run}@test.local`, "Override Visitor");
  ok(await cust.post("/api/customer/registrations", {kind: "VISITOR", consent: true}), 201, "visitor");
  const enr = await db.enrollment.findFirstOrThrow({where: {account: {email: `ovr-${run}@test.local`}, type: "VISITOR"}});
  await db.enrollment.update({where: {id: enr.id}, data: {status: "SUBMITTED", confirmedAt: null}});
  const body = {decision: "CONFIRMED", reason: "Organizer approved manually"};
  ok(await SA.post(`/api/admin/registrations/${enr.id}/review`, body), 409, "policy without override");
  ok(await OPS.post(`/api/admin/registrations/${enr.id}/review`, {...body, override: true}), 409, "operations cannot override");
  const done = await SA.post(`/api/admin/registrations/${enr.id}/review`, {...body, override: true}); ok(done, 200, "super admin override");
  assert.equal(done.body.status, "CONFIRMED");
  const audit = await db.auditLog.findFirst({where: {resourceId: enr.id, action: "ENROLLMENT_REVIEW_OVERRIDE"}});
  assert.deepEqual(audit?.afterState?.overrides, ["VISITOR_POLICY"]);

  // Booth request: Super Admin may force a status outside the normal order; others may not.
  S.booth = await db.boothRequest.findFirst({where: {status: {in: ["CONFIRMED", "INVOICED", "ACCEPTED", "ALLOCATION_PENDING"]}, invoices: {none: {}}}})
    ?? await db.boothRequest.findFirst({where: {status: {in: ["NEW", "OFFERED", "ACCEPTED"]}}});
  if (S.booth) {
    const target = S.booth.status === "UNDER_REVIEW" ? "WAITING_INVOICE" : "UNDER_REVIEW";
    const forced = ["NEW", "OFFERED"].includes(S.booth.status) && target === "UNDER_REVIEW" ? "WAITING_INVOICE" : target;
    ok(await OPS.post(`/api/admin/booth-requests/${S.booth.id}/status`, {status: forced, reason: "Ops force attempt", override: true}), 409, "operations cannot force");
    ok(await SA.post(`/api/admin/booth-requests/${S.booth.id}/status`, {status: forced, reason: "Correcting a stuck request", override: true}), 200, "super admin forces status");
    assert.ok(await db.auditLog.findFirst({where: {resourceId: S.booth.id, action: "BOOTH_STATUS_FORCED_OVERRIDE"}}));
  }

  // Mailout: the author may approve their own mailout only as Super Admin with override.
  const draft = await SA.post("/api/admin/mailouts", {subject: "Override " + run, body: "Hall B opens at 09:00 WIB.", segment: "VISITORS", sendAt: new Date(Date.now() + 3600000).toISOString()});
  if (draft.status === 201) {
    ok(await SA.post(`/api/admin/mailouts/${draft.body.mailout.id}/approve`, {reason: "Approving my own"}), 409, "second approver rule");
    ok(await SA.post(`/api/admin/mailouts/${draft.body.mailout.id}/approve`, {reason: "Approving my own after warning", override: true}), 200, "override");
    ok(await SA.post(`/api/admin/mailouts/${draft.body.mailout.id}/cancel`, {reason: "E2E cleanup mailout"}), 200, "cancel");
  }
});
