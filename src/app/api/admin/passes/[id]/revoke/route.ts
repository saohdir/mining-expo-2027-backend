import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
const schema = z.object({reason: z.string().min(8).max(300)}).strict();
/** FR-137: revoke immediately blocks future scans; audited; customer notified. */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params; z.string().uuid().parse(id);
    const x = schema.parse(await req.json());
    await db.$transaction(async tx => {
      const changed = await tx.eventPass.updateMany({where: {id, status: "ACTIVE"}, data: {status: "REVOKED", revokedAt: new Date(), revokeReason: x.reason}});
      if (changed.count !== 1) throw new HttpError(409, "NOT_ACTIVE", "Pass is not active.");
      await tx.auditLog.create({data: {adminId: actor.id, action: "PASS_REVOKED", resourceType: "EventPass", resourceId: id, beforeState: {status: "ACTIVE"}, afterState: {status: "REVOKED", reason: x.reason}}});
      await tx.notificationOutbox.create({data: {topic: "PASS_REVOKED", dedupeKey: "pass-revoked:" + id, payload: {passId: id}}});
    });
    return NextResponse.json({id, status: "REVOKED"}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
