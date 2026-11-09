import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {mailoutsEnabled} from "@/lib/mailouts";

/** FR-154 maker-checker: someone other than the author approves; the worker sends at sendAt. */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    if (!mailoutsEnabled()) throw new HttpError(503, "NOT_ENABLED", "Scheduled mailouts are not enabled.");
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params; const {reason} = z.object({reason: z.string().min(8).max(500)}).strict().parse(await req.json());
    const m = await db.mailout.findUnique({where: {id}});
    if (!m) throw new HttpError(404, "NOT_FOUND", "Mailout not found.");
    if (m.createdBy === actor.id) throw new HttpError(409, "SECOND_APPROVER_REQUIRED", "Another staff member must approve this mailout.");
    const ok = await db.mailout.updateMany({where: {id, status: "DRAFT"}, data: {status: "SCHEDULED", approvedBy: actor.id}});
    if (!ok.count) throw new HttpError(409, "NOT_DRAFT", "Only drafts can be approved.");
    await db.auditLog.create({data: {adminId: actor.id, action: "MAILOUT_APPROVED", resourceType: "Mailout", resourceId: id, afterState: {reason, sendAt: m.sendAt}}});
    return NextResponse.json({id, status: "SCHEDULED"}, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
