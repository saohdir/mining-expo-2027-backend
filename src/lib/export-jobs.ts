import type {PrismaClient} from "@prisma/client";
import {loadDataset, render, type ExportRequest} from "./export-build";
import {ASYNC_LIMIT} from "./report-datasets";
import {removePrivate, storePrivate} from "./private-files";

export const EXPORT_TTL_MS = 24 * 3600 * 1000;
/** Worker step (NFR-26, FR-122): render queued exports up to 100k rows into encrypted private storage,
 * then expire files after 24 h. The requester's CURRENT role is re-checked when the job runs. */
export async function processExportJobs(db: PrismaClient, max = 2) {
  const jobs = await db.exportJob.findMany({where: {state: "QUEUED"}, orderBy: {createdAt: "asc"}, take: max});
  for (const job of jobs) {
    const claimed = await db.exportJob.updateMany({where: {id: job.id, state: "QUEUED"}, data: {state: "RUNNING"}});
    if (claimed.count !== 1) continue;
    try {
      const requester = await db.adminUser.findUnique({where: {id: job.adminId}});
      if (!requester?.active) throw new Error("Requester is no longer active");
      const req = job.filters as unknown as ExportRequest;
      const data = await loadDataset(requester.role, req, ASYNC_LIMIT);
      const out = await render(data, req);
      const key = await storePrivate(out.bytes, out.ext);
      await db.exportJob.update({where: {id: job.id}, data: {state: "COMPLETED", objectKey: key, rowCount: data.rows.length, expiresAt: new Date(Date.now() + EXPORT_TTL_MS)}});
      await db.notification.create({data: {audienceRole: requester.role, type: "EXPORT_READY", recordType: "ExportJob", recordId: job.id}});
    } catch (e) {
      await db.exportJob.update({where: {id: job.id}, data: {state: "FAILED", filters: {...(job.filters as object), error: e instanceof Error ? e.message.slice(0, 200) : "failed"}}});
    }
  }
  const expired = await db.exportJob.findMany({where: {state: "COMPLETED", objectKey: {not: null}, expiresAt: {lt: new Date()}}, take: 50});
  for (const j of expired) { await removePrivate(j.objectKey!); await db.exportJob.update({where: {id: j.id}, data: {state: "EXPIRED", objectKey: null}}); }
  return jobs.length;
}
