import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";

/** Cancel a draft or scheduled mailout (already queued recipients are skipped by the worker). */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS", "SALES"]);
    const {id} = await params; const {reason} = z.object({reason: z.string().min(8).max(500)}).strict().parse(await req.json());
    const ok = await db.mailout.updateMany({where: {id, status: {in: ["DRAFT", "SCHEDULED", "SENDING"]}}, data: {status: "CANCELLED"}});
    if (!ok.count) throw new HttpError(409, "NOT_CANCELLABLE", "This mailout can no longer be cancelled.");
    await db.auditLog.create({data: {adminId: actor.id, action: "MAILOUT_CANCELLED", resourceType: "Mailout", resourceId: id, afterState: {reason}}});
    return NextResponse.json({id, status: "CANCELLED"}, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
