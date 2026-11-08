import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {issueConferencePasses} from "@/lib/passes";

const schema = z.object({decision: z.enum(["CONFIRMED", "REJECTED"]), reason: z.string().min(8).max(500)}).strict();
/** FR-059: confirm or reject all accepted, not-yet-decided delegates of a group in one audited step.
 * Confirmation issues each delegate's own pass; open invitations stay open (they can still accept and be reviewed later). */
export async function POST(req: NextRequest, {params}: {params: Promise<{groupId: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {groupId} = await params;
    const x = schema.parse(await req.json());
    const out = await db.$transaction(async tx => {
      const pending = await tx.enrollment.findMany({where: {groupId, type: "CONFERENCE", status: {in: ["SUBMITTED", "PENDING_REVIEW"]}}, select: {id: true, status: true}});
      if (!pending.length) throw new HttpError(409, "NOTHING_TO_REVIEW", "No delegate registrations are waiting for review in this group.");
      let passes = 0;
      for (const e of pending) {
        await tx.enrollment.update({where: {id: e.id}, data: {status: x.decision, confirmedAt: x.decision === "CONFIRMED" ? new Date() : undefined}});
        if (x.decision === "CONFIRMED") passes += await issueConferencePasses(tx, e.id);
        else await tx.notificationOutbox.create({data: {topic: "ENROLLMENT_REVIEWED", dedupeKey: "group-review:" + e.id, payload: {enrollmentId: e.id}}});
      }
      await tx.auditLog.create({data: {adminId: actor.id, action: "GROUP_REVIEWED", resourceType: "Group", resourceId: groupId,
        beforeState: {enrollments: pending}, afterState: {decision: x.decision, reason: x.reason, count: pending.length, passes}}});
      return {reviewed: pending.length, passes};
    });
    return NextResponse.json(out, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
