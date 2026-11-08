import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
/** FR-150 resolution with audited reason (Super Admin). */
export async function PATCH(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN"]);
    const {id} = await params; z.string().uuid().parse(id);
    const x = z.object({status: z.enum(["IN_PROGRESS", "COMPLETED", "REJECTED"]), reason: z.string().trim().min(8).max(500)}).strict().parse(await req.json());
    const r = await db.dataRequest.findUnique({where: {id}});
    if (!r || ["COMPLETED", "REJECTED"].includes(r.status)) throw new HttpError(409, "CLOSED", "Request missing or already closed.");
    await db.$transaction([db.dataRequest.update({where: {id}, data: {status: x.status, ...(x.status !== "IN_PROGRESS" ? {resolvedAt: new Date(), resolvedBy: actor.id} : {})}}),
      db.auditLog.create({data: {adminId: actor.id, action: "DATA_REQUEST_" + x.status, resourceType: "DataRequest", resourceId: id, beforeState: {status: r.status}, afterState: {status: x.status, reason: x.reason}}})]);
    return NextResponse.json({id, status: x.status}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
