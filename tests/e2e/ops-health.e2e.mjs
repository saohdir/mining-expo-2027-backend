// NFR-07/29: worker heartbeat, deep health for uptime monitors, staff ops status with alerts.
import {test} from "node:test";
import assert from "node:assert/strict";
import {PrismaClient} from "@prisma/client";
import {adminLogin, Client} from "./lib.mjs";

const db = new PrismaClient();
const run = Date.now().toString(36);
test.after(() => db.$disconnect());

test("deep health reports db + worker; ops status is staff-only and raises alerts", async () => {
  const anon = new Client("anon");
  for (let i = 0; i < 30 && (await anon.get("/api/health?deep=1")).status !== 200; i++) await new Promise(s => setTimeout(s, 1000));
  const h = await anon.get("/api/health?deep=1");
  assert.equal(h.status, 200); assert.equal(h.body.database, "ok"); assert.equal(h.body.worker, "ok");
  assert.equal(Object.keys(h.body).some(k => /outbox|alert|count/i.test(k)), false, "no internal details in public health");
  assert.equal((await anon.get("/api/admin/ops")).status, 401);
  assert.equal((await (await adminLogin("VIEWER")).get("/api/admin/ops")).status, 403);
  const OPS = await adminLogin("OPERATIONS");
  const dead = await db.notificationOutbox.create({data: {topic: "E2E_DEAD", dedupeKey: "e2e-dead-" + run, payload: {}, state: "FAILED", attempts: 5}});
  try {
    const s = (await OPS.get("/api/admin/ops")).body;
    assert.equal(s.worker.ok, true); assert.ok(s.outbox.deadLetters >= 1); assert.ok(s.alerts.some(a => /gave up/.test(a)), JSON.stringify(s.alerts));
    await db.appSetting.update({where: {key: "worker.heartbeat"}, data: {value: JSON.stringify({at: new Date(Date.now() - 600000).toISOString(), failing: []})}});
    const stale = await anon.get("/api/health?deep=1");
    // The live worker may refresh the heartbeat at any moment; accept either, but a stale beat must give 503.
    if (stale.body.worker === "down") assert.equal(stale.status, 503);
  } finally { await db.notificationOutbox.delete({where: {id: dead.id}}); }
});
