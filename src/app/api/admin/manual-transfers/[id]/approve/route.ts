import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {assertReferenceUnused, isWriteConflict, queueCustomerNotice, recomputeInvoice} from "@/lib/finance-tx";
import {ledgerTotals} from "@/lib/finance-ledger";

const schema = z.object({reason: z.string().min(8).max(300), override: z.boolean().default(false)}).strict();

/** FR-132 maker-checker: a different FINANCE/SUPER_ADMIN approves a high-value receipt.
 * Self-approval only by SUPER_ADMIN with explicit, audited override. */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["FINANCE", "SUPER_ADMIN"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const x = schema.parse(await req.json());
    const out = await db.$transaction(async tx => {
      const t = await tx.manualTransfer.findUnique({where: {id}, include: {invoice: {include: {transfers: true, adjustments: true}}}});
      if (!t || t.status !== "PENDING_VERIFICATION" || !t.approvalRequired) throw new HttpError(409, "NOT_AWAITING_APPROVAL", "Receipt is not awaiting second approval.");
      const self = t.submittedBy === actor.id;
      if (self && !(x.override && actor.role === "SUPER_ADMIN"))
        throw new HttpError(403, "SAME_ACTOR", "The person who recorded this receipt cannot approve it.");
      if (!["ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE"].includes(t.invoice.status)) throw new HttpError(409, "INVOICE_NOT_PAYABLE", "Invoice is not payable.");
      if (t.bankReference) await assertReferenceUnused(tx, t.bankReference, t.id);
      const totals = ledgerTotals(t.invoice.totalMinor, t.invoice.transfers, t.invoice.adjustments);
      if (t.amountMinor > totals.outstanding) throw new HttpError(409, "AMOUNT_EXCEEDS_OUTSTANDING", "Receipt exceeds the outstanding balance.");
      const moved = await tx.manualTransfer.updateMany({where: {id, status: "PENDING_VERIFICATION"}, data: {status: "VERIFIED", verifiedAt: new Date(), verifiedBy: actor.id}});
      if (moved.count !== 1) throw new HttpError(409, "CONCURRENT_VERIFICATION", "Receipt changed; reload.");
      const after = await recomputeInvoice(tx, t.invoiceId);
      await tx.auditLog.create({data: {adminId: actor.id, action: self ? "BANK_TRANSFER_SELF_APPROVED_OVERRIDE" : "BANK_TRANSFER_APPROVED",
        resourceType: "ManualTransfer", resourceId: id, beforeState: {status: "PENDING_VERIFICATION", submittedBy: t.submittedBy},
        afterState: {status: "VERIFIED", reason: x.reason, invoiceStatus: after.invoice.status}}});
      await queueCustomerNotice(tx, "PAYMENT_VERIFIED", t.invoiceId, id);
      return {transferId: id, invoiceStatus: after.invoice.status, paidMinor: after.totals.paid.toString(), outstandingMinor: after.totals.outstanding.toString()};
    }, {isolationLevel: "Serializable"});
    return NextResponse.json(out, {headers: {"Cache-Control": "no-store"}});
  } catch (e) {
    if (isWriteConflict(e)) return failure(new HttpError(409, "CONCURRENT_VERIFICATION", "Reload and retry."));
    return failure(e);
  }
}
