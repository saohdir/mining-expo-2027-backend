/**
 * NFR-26 load test: seed N synthetic registrations into a DISPOSABLE database, run the real export worker for each format and
 * report duration, peak memory and file size. Refuses to run unless DATABASE_URL points at a database whose name contains "e2e"
 * or "loadtest".
 *   DATABASE_URL=postgresql://…/imdx_loadtest npx tsx scripts/perf/export-load-test.ts --rows 100000
 */
import {PrismaClient} from "@prisma/client";
import {processExportJobs} from "../../src/lib/export-jobs";

const db = new PrismaClient();
const rows = Number(process.argv[process.argv.indexOf("--rows") + 1] || 100000);
async function main() {
  if (!/e2e|loadtest/.test(new URL(process.env.DATABASE_URL || "postgresql://x/x").pathname)) throw new Error("Use a disposable database (name must contain e2e or loadtest).");
  process.env.PRIVATE_FILE_DIR ||= "/tmp/imdx-loadtest-private";
  const ev = await db.event.findFirstOrThrow();
  const have = await db.enrollment.count({where: {profileSnapshot: {path: ["loadtest"], equals: true}}});
  if (have < rows) {
    const t = Date.now();
    await db.$executeRawUnsafe(`INSERT INTO "CustomerAccount"(id,email,status,"verifiedEmailAt","createdAt","updatedAt")
      SELECT 'lt-' || g, 'lt' || g || '@loadtest.invalid', 'ACTIVE', now(), now(), now() FROM generate_series(${have + 1}, ${rows}) g ON CONFLICT DO NOTHING`);
    await db.$executeRawUnsafe(`INSERT INTO "CustomerProfile"(id,"accountId","fullName",organization,"consentVersion","consentAt","updatedAt")
      SELECT 'ltp-' || g, 'lt-' || g, 'Load Test ' || g, 'Company ' || (g % 500), 'loadtest', now(), now() FROM generate_series(${have + 1}, ${rows}) g ON CONFLICT DO NOTHING`);
    await db.$executeRawUnsafe(`INSERT INTO "Enrollment"(id,"accountId","eventId",type,status,"profileSnapshot","consentAt","createdAt")
      SELECT 'lte-' || g, 'lt-' || g, '${ev.id}', 'VISITOR', 'CONFIRMED', '{"loadtest": true}', now(), now() - (g || ' seconds')::interval FROM generate_series(${have + 1}, ${rows}) g ON CONFLICT DO NOTHING`);
    console.log(`seeded ${rows - have} registrations in ${((Date.now() - t) / 1000).toFixed(1)} s`);
  }
  const adminUser = await db.adminUser.findFirstOrThrow({where: {role: "SUPER_ADMIN"}});
  for (const format of ["xlsx", "pdf"]) {
    const job = await db.exportJob.create({data: {adminId: adminUser.id, reportType: "registrations", format, filters: {dataset: "registrations", basis: "created", format}}});
    let peak = 0; const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 100);
    const t = Date.now(); await processExportJobs(db, 1); clearInterval(timer);
    const done = await db.exportJob.findUniqueOrThrow({where: {id: job.id}});
    console.log(`${format}: state=${done.state} rows=${done.rowCount} time=${((Date.now() - t) / 1000).toFixed(1)}s peakRSS=${Math.round(peak / 1048576)}MB ${done.state === "FAILED" ? JSON.stringify(done.filters) : ""}`);
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
