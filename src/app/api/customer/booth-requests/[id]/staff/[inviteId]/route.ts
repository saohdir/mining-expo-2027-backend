import {NextRequest, NextResponse} from "next/server";
import {customer} from "@/lib/auth";
import {db} from "@/lib/db";
import {failure, HttpError} from "@/lib/errors";
import {requireEnabled} from "@/lib/policy";
import {assertSameOrigin} from "@/lib/customer-auth";
import {revokeInvitation} from "@/lib/invitations";

/** FR-156: the booth owner removes a representative; an issued expo pass is revoked immediately. */
export async function DELETE(req: NextRequest, {params}: {params: Promise<{id: string; inviteId: string}>}) {
  try {
    requireEnabled("exhibitorStaff"); assertSameOrigin(req);
    const acc = await customer(); const {id, inviteId} = await params;
    const inv = await db.invitation.findFirst({where: {id: inviteId, boothRequestId: id, kind: "EXHIBITOR_STAFF", inviterAccountId: acc.id}});
    if (!inv) throw new HttpError(404, "NOT_FOUND", "Representative not found.");
    const r = await db.$transaction(async tx => {
      const out = await revokeInvitation(tx, inv.id, "Removed by exhibitor");
      await tx.auditLog.create({data: {accountId: acc.id, action: "EXHIBITOR_STAFF_REMOVED", resourceType: "Invitation", resourceId: inv.id, beforeState: {status: inv.status}}});
      return out;
    });
    return NextResponse.json({id: r.id, status: r.status}, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
