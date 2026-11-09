// CMS/portal redesign (Nov 2026): additive list API parameters (page size, sort, status, paged booth requests) and the
// role-scoped recent-activity feed. Defaults must keep the original responses.
import {test} from "node:test";
import assert from "node:assert/strict";
import {adminLogin, customerSignup} from "./lib.mjs";

const run = Date.now().toString(36);
test("list APIs: page size, sort, status filter, paged booth requests; activity is role-scoped", async () => {
  const [SA, FIN, ED, CHK] = await Promise.all([adminLogin("SUPER_ADMIN"), adminLogin("FINANCE"), adminLogin("CONTENT_EDITOR"), adminLogin("CHECKIN_STAFF")]);
  for (let i = 0; i < 3; i++) await customerSignup(`rd-${run}-${i}@test.local`, `Redesign ${String.fromCharCode(67 - i)} ${run}`);

  // Customers: default unchanged (30 per page, newest first); pageSize/sort/status are optional.
  const def = await SA.get("/api/admin/customers"); assert.equal(def.status, 200); assert.equal(def.body.limit, 30);
  const two = await SA.get(`/api/admin/customers?q=${run}&pageSize=10&sort=name:asc`); assert.equal(two.body.limit, 10); assert.equal(two.body.total, 3);
  assert.deepEqual(two.body.customers.map(c => c.profile.fullName[9]), ["A", "B", "C"], "sorted by name ascending");
  const desc = await SA.get(`/api/admin/customers?q=${run}&sort=name:desc`); assert.equal(desc.body.customers[0].profile.fullName[9], "C");
  const p2 = await SA.get(`/api/admin/customers?q=${run}&pageSize=10&page=2`); assert.equal(p2.body.customers.length, 0);
  assert.equal((await SA.get(`/api/admin/customers?q=${run}&status=SUSPENDED`)).body.total, 0, "status filter");
  assert.equal((await SA.get(`/api/admin/customers?q=${run}&status=NOPE`)).body.total, 3, "unknown status ignored");
  assert.equal((await SA.get(`/api/admin/customers?pageSize=999`)).body.limit, 30, "page size whitelist");

  // Registrations: optional sort keeps validation and defaults.
  const regs = await SA.get(`/api/admin/registrations?limit=5&sort=created:asc`); assert.equal(regs.status, 200);
  const ts = regs.body.rows.map(r => Date.parse(r.createdAt)); assert.deepEqual(ts, [...ts].sort((a, b) => a - b), "oldest first");
  assert.equal((await SA.get(`/api/admin/registrations?sort=customer:desc`)).status, 200);

  // Booth requests: without ?page the original list (no total) is returned; with ?page a counted page.
  const legacy = await SA.get("/api/admin/booth-requests"); assert.equal(legacy.status, 200); assert.equal(legacy.body.total, undefined);
  const paged = await SA.get("/api/admin/booth-requests?page=1&pageSize=10&sort=created:desc"); assert.equal(paged.status, 200);
  assert.equal(typeof paged.body.total, "number"); assert.ok(paged.body.records.length <= 10);
  assert.equal((await SA.get("/api/admin/booth-requests?page=1&q=zz-no-such-customer-" + run)).body.total, 0);

  // Activity: read-only, no payloads, scoped per role; check-in staff have no access.
  await ED.post("/api/admin/content", {kind: "NEWS", locale: "en", title: "Redesign activity " + run, slug: "redesign-activity-" + run, summary: "x", body: "x"}).catch(() => {});
  const all = await SA.get("/api/admin/activity"); assert.equal(all.status, 200); assert.ok(Array.isArray(all.body.activity));
  for (const a of all.body.activity) { assert.deepEqual(Object.keys(a).sort(), ["action", "at", "by", "reference", "self", "type"]); assert.ok(!/login|sign/i.test(a.action)); }
  const fin = await FIN.get("/api/admin/activity"); assert.equal(fin.status, 200);
  assert.ok(fin.body.activity.every(a => ["Invoice", "Manual Transfer", "Booth Request", "Enrollment", "Export Job"].includes(a.type)), JSON.stringify(fin.body.activity.map(a => a.type)));
  const ed = await ED.get("/api/admin/activity");
  assert.ok(ed.body.activity.every(a => ["Page Layout", "Content Item", "Programme Item", "Gallery Item", "Gallery Year", "Media Asset", "Conference"].includes(a.type)));
  assert.equal((await CHK.get("/api/admin/activity")).status, 403);
});
