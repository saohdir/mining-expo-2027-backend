// FR-041 (P2): new event editions (setup cloned, nothing else), active edition first, four-eyes content approval.
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, Client} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36).toUpperCase();
const ok = (r, code, label) => assert.equal(r.status, code, label + " → " + r.status + " " + JSON.stringify(r.body).slice(0, 300));
test.after(() => db.$disconnect());

test("FR-041: create edition cloning setup only; unpublished; active edition stays first", async () => {
  const SA = await adminLogin("SUPER_ADMIN"), OPS = await adminLogin("OPERATIONS");
  const body = {code: "IMDX-" + run, title: "IMDX Next Edition", venue: "JIEXPO Kemayoran, Jakarta", startsAt: "2028-05-24T09:00:00+07:00", endsAt: "2028-05-26T18:00:00+07:00", cloneFrom: "IMDX-2027", reason: "Prepare next edition setup"};
  ok(await OPS.post("/api/admin/events", body), 403, "ops cannot create editions");
  ok(await SA.post("/api/admin/events", {...body, endsAt: "2028-05-01T00:00:00+07:00"}), 400, "dates");
  const src = await db.event.findUniqueOrThrow({where: {code: "IMDX-2027"}});
  const [cats, gates] = await Promise.all([db.boothCategory.count({where: {eventId: src.id}}), db.gate.count({where: {eventId: src.id}})]);
  const c = await SA.post("/api/admin/events", body); ok(c, 201, "create");
  assert.equal(c.body.event.published, false); assert.equal(c.body.copied.categories, cats); assert.equal(c.body.copied.gates, gates);
  ok(await SA.post("/api/admin/events", body), 409, "code unique");
  const e = await db.event.findUniqueOrThrow({where: {code: body.code}, include: {conferences: true, floorplans: true, enrollments: true}});
  assert.equal(e.conferences.length + e.floorplans.length + e.enrollments.length, 0, "no bookings/content copied");
  assert.equal(await db.staffGateAssignment.count({where: {gate: {eventId: e.id}}}), 0, "no staff copied");
  if (!src.published) await db.event.update({where: {id: src.id}, data: {published: true}});
  await db.event.update({where: {id: e.id}, data: {published: true}});
  const pub = (await new Client("anon").get("/api/public/events")).body.events;
  assert.equal(pub[0].code, "IMDX-2027"); assert.equal(pub[0].active, true); assert.ok(pub.some(x => x.code === body.code && !x.active));
  await db.event.update({where: {id: e.id}, data: {published: false}});
  const adminList = (await SA.get("/api/admin/events")).body; assert.equal(adminList.activeEventCode, "IMDX-2027");
});

test("FR-041: with CONTENT_APPROVAL_REQUIRED the draft author cannot publish; a second editor can", async () => {
  const base = process.env.E2E_CLOSED_BASE_URL; if (!base) return;
  const login = async role => { const r = await fetch(base + "/api/admin/auth/login", {method: "POST", headers: {"content-type": "application/json", origin: base}, body: JSON.stringify({email: role.toLowerCase() + "@test.local", password: "local-test-password-" + role})}); return r.headers.getSetCookie().map(c => c.split(";")[0]).join("; "); };
  const call = async (cookie, method, path, b) => { const r = await fetch(base + path, {method, headers: {"content-type": "application/json", origin: base, cookie}, body: b ? JSON.stringify(b) : undefined}); return {status: r.status, body: await r.json().catch(() => ({}))}; };
  const editor = await login("CONTENT_EDITOR"), sa = await login("SUPER_ADMIN");
  const d = (await call(editor, "GET", "/api/admin/pages/contact")).body;
  ok(await call(editor, "PUT", "/api/admin/pages/contact", {seo: {title: "Contact | approval", description: ""}, blocks: d.draft.blocks}), 200, "draft by editor");
  const self = await call(editor, "POST", "/api/admin/pages/contact/publish", {reason: "Publish my own draft"}); ok(self, 409, "author cannot publish"); assert.equal(self.body.error, "APPROVAL_REQUIRED");
  ok(await call(sa, "POST", "/api/admin/pages/contact/publish", {reason: "Reviewed and approved"}), 200, "second person publishes");
  ok(await call(sa, "POST", "/api/admin/pages/contact/rollback", {version: 0, reason: "Restore design after test"}), 200, "cleanup");
});
