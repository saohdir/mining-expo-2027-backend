import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {ledgerTotals, reversibleAmount} from "@/lib/finance-ledger";
import {isWriteConflict, queueCustomerNotice, recomputeInvoice} from "@/lib/finance-tx";

const schema = z.discriminatedUnion("type", [
  z.object({type: z.literal("REVERSAL"), transferId: z.string().uuid(), amountMinor: z.string().regex(/^[1-9]\d*$/), reason: z.string().min(10).max(400)}).strict(),
  z.object({type: z.literal("REFUND"), amountMinor: z.string().regex(/^[1-9]\d*$/), reason: z.string().min(10).max(400),
    payoutReference: z.string().min(4).max(120), bankVerified: z.literal(true)}).strict()
]);

/** FR-131 / AT-087: corrections are appended, never edits or deletes.
 * REVERSAL undoes a misposted verified receipt; REFUND records an executed payout
 * after cancellation (policy D-03 decides eligibility; no automatic bank transfer). */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["FINANCE", "SUPER_ADMIN"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const x = schema.parse(await req.json());
    const amount = BigInt(x.amountMinor);
    const out = await db.$transaction(async tx => {
      const inv = await tx.invoice.findUnique({where: {id}, include: {transfers: true, adjustments: true}});
      if (!inv) throw new HttpError(404, "NOT_FOUND", "Invoice missing.");
      const totals = ledgerTotals(inv.totalMinor, inv.transfers, inv.adjustments);
      let transferId: string | null = null;
      if (x.type === "REVERSAL") {
        const receipt = inv.transfers.find(t => t.id === x.transferId);
        if (!receipt) throw new HttpError(404, "RECEIPT_NOT_FOUND", "Receipt does not belong to this invoice.");
        const prior = inv.adjustments.filter(a => a.type === "REVERSAL" && a.transferId === receipt.id).map(a => a.amountMinor);
        const left = reversibleAmount(receipt, prior);
        if (amount > left) throw new HttpError(409, "REVERSAL_EXCEEDS_RECEIPT", "Reversal exceeds the remaining verified amount (" + left.toString() + ").");
        transferId = receipt.id;
      } else {
        if (!["CANCELLED", "VOID"].includes(inv.status)) throw new HttpError(409, "REFUND_REQUIRES_CANCELLATION", "Cancel the invoice before recording a refund payout.");
        if (amount > totals.paid - totals.refunded) throw new HttpError(409, "REFUND_EXCEEDS_PAID", "Refund exceeds net confirmed receipts not yet refunded.");
      }
      const adj = await tx.paymentAdjustment.create({data: {invoiceId: id, transferId, type: x.type, amountMinor: amount, reason: x.reason,
        approvedBy: actor.id, evidenceRef: x.type === "REFUND" ? x.payoutReference : null}});
      const after = await recomputeInvoice(tx, id);
      await tx.auditLog.create({data: {adminId: actor.id, action: "PAYMENT_" + x.type, resourceType: "Invoice", resourceId: id,
        beforeState: {status: inv.status, paidMinor: totals.paid.toString()},
        afterState: {adjustmentId: adj.id, amountMinor: x.amountMinor, reason: x.reason, status: after.invoice.status, paidMinor: after.totals.paid.toString()}}});
      await queueCustomerNotice(tx, x.type === "REVERSAL" ? "PAYMENT_CORRECTED" : "REFUND_RECORDED", id, adj.id);
      return {adjustmentId: adj.id, invoiceStatus: after.invoice.status, paidMinor: after.totals.paid.toString(), outstandingMinor: after.totals.outstanding.toString()};
    }, {isolationLevel: "Serializable"});
    return NextResponse.json(out, {status: 201, headers: {"Cache-Control": "no-store"}});
  } catch (e) {
    if (isWriteConflict(e)) return failure(new HttpError(409, "CONCURRENT_UPDATE", "Reload and retry."));
    return failure(e);
  }
}
