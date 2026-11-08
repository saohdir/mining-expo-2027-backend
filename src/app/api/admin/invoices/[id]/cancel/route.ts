import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {revokeBoothStaff} from "@/lib/invitations";
import {failure, HttpError} from "@/lib/errors";
import {customerPaymentState} from "@/lib/finance-ledger";
import {isWriteConflict} from "@/lib/finance-tx";

const schema = z.object({reason: z.string().min(10).max(400), cancelBooking: z.boolean().default(false)}).strict();

/** Cancel an invoice (FR-056/077, AT-069). Verified receipts stay in the ledger; the customer
 * sees REFUND_PENDING until Finance records an actual payout. With cancelBooking the linked
 * registration is cancelled and its passes revoked immediately; booth allocations are flagged
 * to Operations, who release units explicitly. */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["FINANCE", "SUPER_ADMIN"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const x = schema.parse(await req.json());
    const out = await db.$transaction(async tx => {
      const inv = await tx.invoice.findUnique({where: {id}, include: {transfers: true, adjustments: true}});
      if (!inv) throw new HttpError(404, "NOT_FOUND", "Invoice missing");
      if (!["DRAFT", "ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"].includes(inv.status)) throw new HttpError(409, "INVALID_STATUS", "Invoice cannot be cancelled.");
      if (inv.transfers.some(t => t.status === "PENDING_VERIFICATION")) throw new HttpError(409, "PENDING_RECEIPTS", "Resolve pending proofs/approvals before cancelling.");
      const changed = await tx.invoice.update({where: {id}, data: {status: "CANCELLED", cancelledAt: new Date(), cancelReason: x.reason}});
      let revokedPasses = 0;
      if (x.cancelBooking && inv.enrollmentId) {
        await tx.enrollment.update({where: {id: inv.enrollmentId}, data: {status: "CANCELLED"}});
        revokedPasses = (await tx.eventPass.updateMany({where: {enrollmentId: inv.enrollmentId, status: "ACTIVE"}, data: {status: "REVOKED"}})).count;
      }
      if (x.cancelBooking && inv.boothRequestId) {
        revokedPasses += await revokeBoothStaff(tx, inv.boothRequestId, "Exhibitor booking cancelled");
        await tx.notification.create({data: {audienceRole: "OPERATIONS", type: "BOOTH_INVOICE_CANCELLED", recordType: "BoothRequest", recordId: inv.boothRequestId}});
      }
      const summary = customerPaymentState(changed, inv.transfers, inv.adjustments);
      await tx.auditLog.create({data: {adminId: actor.id, action: "INVOICE_CANCELLED", resourceType: "Invoice", resourceId: id,
        beforeState: {status: inv.status}, afterState: {status: "CANCELLED", reason: x.reason, cancelBooking: x.cancelBooking, revokedPasses, customerState: summary.state}}});
      await tx.notificationOutbox.create({data: {topic: "BOOKING_CANCELLED", dedupeKey: "invoice-cancelled:" + id, payload: {invoiceId: id}}});
      return {id, status: "CANCELLED", customerState: summary.state, refundableMinor: summary.paidMinor, revokedPasses};
    }, {isolationLevel: "Serializable"});
    return NextResponse.json(out, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) {
    if (isWriteConflict(e)) return failure(new HttpError(409, "CONCURRENT_UPDATE", "Reload and retry."));
    return failure(e);
  }
}
