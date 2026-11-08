import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {readPrivate} from "@/lib/private-files";

/** Requester-only (or SUPER_ADMIN) download of a completed, unexpired export; every download is audited. */
export async function GET(_req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "FINANCE", "OPERATIONS", "SALES"]);
    const {id} = await params; z.string().uuid().parse(id);
    const job = await db.exportJob.findUnique({where: {id}});
    if (!job || (job.adminId !== actor.id && actor.role !== "SUPER_ADMIN")) throw new HttpError(404, "NOT_FOUND", "Export not found.");
    if (job.state !== "COMPLETED" || !job.objectKey) throw new HttpError(409, "NOT_READY", "Export is " + job.state.toLowerCase() + ".");
    if (!job.expiresAt || job.expiresAt < new Date()) throw new HttpError(410, "EXPIRED", "This export link has expired. Request a new export.");
    const bytes = await readPrivate(job.objectKey);
    await db.auditLog.create({data: {adminId: actor.id, action: "EXPORT_DOWNLOADED", resourceType: "ExportJob", resourceId: id, afterState: {rows: job.rowCount}}});
    const xlsx = job.format === "xlsx";
    return new NextResponse(new Uint8Array(bytes), {headers: {"Content-Type": xlsx ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
      "Content-Disposition": `attachment; filename="imdx-${job.reportType.toLowerCase()}-${id.slice(0, 8)}.${job.format}"`, "Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
