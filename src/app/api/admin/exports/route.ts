import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {validateExport} from "@/lib/export-build";

const schema = z.object({dataset: z.enum(["registrations", "booths", "finance"]), basis: z.string().max(20), format: z.enum(["xlsx", "pdf"]).default("xlsx"),
  from: z.string().max(10).nullable().optional(), to: z.string().max(10).nullable().optional(), type: z.string().max(20).optional(), status: z.string().max(20).optional(),
  hall: z.string().max(60).optional(), zone: z.string().max(60).optional(), q: z.string().max(120).optional()}).strict();
const ROLES = ["SUPER_ADMIN", "FINANCE", "OPERATIONS", "SALES"] as const;

/** NFR-26 / FR-122: queue a background export (≤100k rows); requester-only, expiring download. */
export async function POST(req: NextRequest) {
  try {
    const actor = await admin([...ROLES]);
    const x = schema.parse(await req.json());
    validateExport(x);
    if (x.dataset === "finance" && !["SUPER_ADMIN", "FINANCE"].includes(actor.role)) throw new HttpError(403, "FORBIDDEN", "Finance exports are restricted to Finance.");
    if (await db.exportJob.count({where: {adminId: actor.id, state: {in: ["QUEUED", "RUNNING"]}}}) >= 3) throw new HttpError(429, "TOO_MANY_JOBS", "Wait for your running exports to finish.");
    const job = await db.exportJob.create({data: {adminId: actor.id, reportType: x.dataset.toUpperCase(), filters: {...x, timezone: "Asia/Jakarta"}, format: x.format, state: "QUEUED"}});
    await db.auditLog.create({data: {adminId: actor.id, action: "EXPORT_QUEUED", resourceType: "ExportJob", resourceId: job.id, afterState: {filters: x}}});
    return NextResponse.json({id: job.id, state: job.state}, {status: 202, headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
export async function GET() {
  try {
    const actor = await admin([...ROLES]);
    const jobs = await db.exportJob.findMany({where: actor.role === "SUPER_ADMIN" ? {} : {adminId: actor.id}, orderBy: {createdAt: "desc"}, take: 50,
      select: {id: true, reportType: true, format: true, state: true, rowCount: true, expiresAt: true, createdAt: true, filters: true, adminId: true}});
    return NextResponse.json({jobs}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
