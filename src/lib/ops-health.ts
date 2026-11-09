import type {PrismaClient} from "@prisma/client";

/** NFR-07/29 observability. The worker writes a heartbeat (time + failing step names, never payloads) every cycle. */
export const HEARTBEAT_KEY = "worker.heartbeat";
export const HEARTBEAT_STALE_MS = 5 * 60000;
export async function writeHeartbeat(db: PrismaClient, results: {name: string; ok: boolean}[]) {
  const value = JSON.stringify({at: new Date().toISOString(), failing: results.filter(r => !r.ok).map(r => r.name)});
  await db.appSetting.upsert({where: {key: HEARTBEAT_KEY}, update: {value, updatedBy: "worker"}, create: {key: HEARTBEAT_KEY, value, updatedBy: "worker"}});
}
export async function opsStatus(db: PrismaClient, now = new Date()) {
  const [hb, queued, failed, dead, oldest, exportsFailed, transfersPending, retention] = await Promise.all([
    db.appSetting.findUnique({where: {key: HEARTBEAT_KEY}}),
    db.notificationOutbox.count({where: {state: {in: ["QUEUED", "PROCESSING"]}}}),
    db.notificationOutbox.count({where: {state: "FAILED", attempts: {lt: 5}}}),
    db.notificationOutbox.count({where: {state: "FAILED", attempts: {gte: 5}}}),
    db.notificationOutbox.findFirst({where: {state: {in: ["QUEUED", "FAILED"]}, attempts: {lt: 5}}, orderBy: {createdAt: "asc"}, select: {createdAt: true}}),
    db.exportJob.count({where: {state: "FAILED", createdAt: {gte: new Date(now.getTime() - 86400000)}}}),
    db.manualTransfer.count({where: {status: "PENDING_VERIFICATION", createdAt: {lt: new Date(now.getTime() - 2 * 86400000)}}}),
    db.appSetting.findUnique({where: {key: "retention.lastRun"}})
  ]);
  const beat = hb ? JSON.parse(hb.value) as {at: string; failing: string[]} : null;
  const workerOk = !!beat && now.getTime() - Date.parse(beat.at) < HEARTBEAT_STALE_MS;
  const alerts: string[] = [];
  if (!workerOk) alerts.push(beat ? "Worker heartbeat is stale (no cycle in 5 min)" : "Worker has never reported a heartbeat");
  if (beat?.failing.length) alerts.push("Worker steps failing: " + beat.failing.join(", "));
  if (dead) alerts.push(dead + " notification(s) gave up after 5 attempts");
  if (oldest && now.getTime() - oldest.createdAt.getTime() > 3600000) alerts.push("Oldest pending notification is over 1 hour old");
  if (exportsFailed) alerts.push(exportsFailed + " export job(s) failed in the last 24 h");
  if (transfersPending) alerts.push(transfersPending + " transfer proof(s) waiting for Finance verification over 48 h");
  return {ok: alerts.length === 0, checkedAt: now.toISOString(), worker: {ok: workerOk, lastCycleAt: beat?.at ?? null, failingSteps: beat?.failing ?? []},
    outbox: {pending: queued, retrying: failed, deadLetters: dead, oldestPendingAt: oldest?.createdAt ?? null}, exportsFailed24h: exportsFailed,
    financeBacklog: {transfersPendingOver48h: transfersPending}, retentionLastRun: retention?.value ?? null, alerts};
}
