import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {customer} from "@/lib/auth";
import {db} from "@/lib/db";
import {failure, HttpError} from "@/lib/errors";
import {requireEnabled} from "@/lib/policy";
import {assertSameOrigin} from "@/lib/customer-auth";
import {revokeInvitation} from "@/lib/invitations";

const schema = z.object({invitationId: z.string().uuid()}).strict();
/** FR-059: the coordinator withdraws one delegate (open invitation or not-yet-confirmed registration). */
export async function DELETE(req: NextRequest, {params}: {params: Promise<{groupId: string}>}) {
  try {
    requireEnabled("groupEnrollment"); assertSameOrigin(req);
    const acc = await customer(); const {groupId} = await params;
    const {invitationId} = schema.parse(await req.json());
    const inv = await db.invitation.findFirst({where: {id: invitationId, groupId, kind: "GROUP_DELEGATE", inviterAccountId: acc.id}});
    if (!inv) throw new HttpError(404, "NOT_FOUND", "Delegate not found.");
    if (inv.enrollmentId && (await db.enrollment.findUnique({where: {id: inv.enrollmentId}}))?.status === "CONFIRMED")
      throw new HttpError(409, "ALREADY_CONFIRMED", "Confirmed delegates can only be changed by the organizer (refund/cancellation policy applies).");
    const r = await db.$transaction(async tx => {
      const out = await revokeInvitation(tx, inv.id, "Withdrawn by group coordinator");
      await tx.auditLog.create({data: {accountId: acc.id, action: "GROUP_DELEGATE_WITHDRAWN", resourceType: "Invitation", resourceId: inv.id, beforeState: {status: inv.status}}});
      return out;
    });
    return NextResponse.json({id: r.id, status: r.status}, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
