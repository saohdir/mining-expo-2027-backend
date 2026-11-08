import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {requireEnabled} from "@/lib/policy";
import {failure, HttpError} from "@/lib/errors";
import {ledgerTotals, needsSecondApproval} from "@/lib/finance-ledger";
import {assertReferenceUnused, bankRefHash, isWriteConflict, queueCustomerNotice, recomputeInvoice} from "@/lib/finance-tx";

const schema = z.object({
  amountMinor: z.string().regex(/^[1-9]\d*$/),
  bankReference: z.string().min(4).max(120),
  transferredAt: z.string().datetime(),
  bankVerified: z.literal(true),
  reason: z.string().min(8).max(300),
  payerName: z.string().max(160).optional(),
  // Optional: settle a customer-submitted proof row instead of creating a new receipt.
  proofTransferId: z.string().uuid().optional()
}).strict();

/** FINANCE records a bank-confirmed receipt (FR-048/129). Proof ≠ paid (FR-128).
 * Above the configured threshold the receipt waits for a second approver (FR-132). */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    requireEnabled("invoices");
    const actor = await admin(["FINANCE", "SUPER_ADMIN"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const x = schema.parse(await req.json());
    const refHash = bankRefHash(x.bankReference);
    const amount = BigInt(x.amountMinor);
    if (amount > 10_000_000_000_000n) throw new HttpError(400, "AMOUNT_TOO_LARGE", "Amount exceeds configured safety limit.");
    const secondApproval = needsSecondApproval(amount);
    const result = await db.$transaction(async tx => {
      const invoice = await tx.invoice.findUnique({where: {id}, include: {transfers: true, adjustments: true}});
      if (!invoice || !["ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status))
        throw new HttpError(409, "INVOICE_NOT_PAYABLE", "Invoice is not payable.");
      await assertReferenceUnused(tx, refHash, x.proofTransferId);
      if (invoice.transfers.some(t => t.bankReference === refHash && t.status === "PENDING_VERIFICATION" && t.approvalRequired && t.id !== x.proofTransferId))
        throw new HttpError(409, "AWAITING_SECOND_APPROVAL", "This reference already waits for second approval.");
      const totals = ledgerTotals(invoice.totalMinor, invoice.transfers, invoice.adjustments);
      const pendingApproval = invoice.transfers.filter(t => t.status === "PENDING_VERIFICATION" && t.approvalRequired).reduce((a, t) => a + t.amountMinor, 0n);
      if (amount > totals.outstanding - pendingApproval)
        throw new HttpError(409, "AMOUNT_EXCEEDS_OUTSTANDING", "Verified amount exceeds the outstanding balance (" + (totals.outstanding - pendingApproval).toString() + "). Record only the amount that settles this invoice and escalate any excess to Finance.");
      const data = {
        amountMinor: amount, bankReference: refHash, transferredAt: new Date(x.transferredAt), payerName: x.payerName,
        submittedBy: actor.id, decisionReason: x.reason,
        ...(secondApproval ? {status: "PENDING_VERIFICATION" as const, approvalRequired: true}
          : {status: "VERIFIED" as const, verifiedAt: new Date(), verifiedBy: actor.id})
      };
      let transferId: string;
      if (x.proofTransferId) {
        const proof = invoice.transfers.find(t => t.id === x.proofTransferId);
        if (!proof || proof.source !== "CUSTOMER_PROOF" || proof.status !== "PENDING_VERIFICATION")
          throw new HttpError(409, "PROOF_NOT_PENDING", "Customer proof is not pending verification.");
        const moved = await tx.manualTransfer.updateMany({where: {id: proof.id, status: "PENDING_VERIFICATION"}, data});
        if (moved.count !== 1) throw new HttpError(409, "CONCURRENT_VERIFICATION", "Proof changed; reload.");
        transferId = proof.id;
      } else {
        transferId = (await tx.manualTransfer.create({data: {invoiceId: id, source: "FINANCE", ...data}})).id;
      }
      const after = await recomputeInvoice(tx, id);
      await tx.auditLog.create({data: {adminId: actor.id, action: secondApproval ? "BANK_TRANSFER_SUBMITTED_FOR_APPROVAL" : "BANK_TRANSFER_VERIFIED",
        resourceType: "ManualTransfer", resourceId: transferId,
        afterState: {invoiceId: id, amountMinor: x.amountMinor, reason: x.reason, proofTransferId: x.proofTransferId ?? null, invoiceStatus: after.invoice.status}}});
      if (secondApproval) {
        await tx.notification.create({data: {audienceRole: "FINANCE", type: "PAYMENT_APPROVAL_REQUIRED", recordType: "Invoice", recordId: id}});
      } else {
        await queueCustomerNotice(tx, "PAYMENT_VERIFIED", id, transferId);
      }
      return {invoiceId: id, transferId, approvalRequired: secondApproval, invoiceStatus: after.invoice.status,
        paidMinor: after.totals.paid.toString(), outstandingMinor: after.totals.outstanding.toString(),
        state: after.totals.paid === 0n ? "AWAITING_PAYMENT" : after.totals.outstanding === 0n ? "PAID_IN_FULL" : "DP_RECEIVED",
        invoiceState: after.invoice.status};
    }, {isolationLevel: "Serializable"});
    return NextResponse.json(result, {status: secondApproval ? 202 : 200, headers: {"Cache-Control": "no-store"}});
  } catch (e) {
    if (isWriteConflict(e)) return failure(new HttpError(409, "CONCURRENT_VERIFICATION", "Another verification changed this invoice. Reload and check before retrying."));
    return failure(e);
  }
}
