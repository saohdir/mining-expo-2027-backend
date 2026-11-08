import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {customer} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {PROOF_TYPES, sniff, storePrivate} from "@/lib/private-files";
import {bankRefHash} from "@/lib/finance-tx";

export const runtime = "nodejs";
const MAX = 5 * 1024 * 1024;
const fields = z.object({
  amountMinor: z.string().regex(/^[1-9]\d*$/),
  bankReference: z.string().trim().min(4).max(120),
  transferredAt: z.string().datetime(),
  payerName: z.string().trim().max(160).optional()
}).strict();

/** FR-128 / AT-064: optional customer transfer proof. Creates PENDING_VERIFICATION only;
 * the invoice stays unpaid until FINANCE verifies the bank statement. */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const acc = await customer();
    const {id} = await params;
    z.string().uuid().parse(id);
    const fd = await req.formData();
    const file = fd.get("file");
    const x = fields.parse({amountMinor: fd.get("amountMinor"), bankReference: fd.get("bankReference"), transferredAt: fd.get("transferredAt"),
      ...(fd.get("payerName") ? {payerName: fd.get("payerName")} : {})});
    const inv = await db.invoice.findFirst({where: {id, accountId: acc.id}, include: {transfers: {where: {status: "PENDING_VERIFICATION", source: "CUSTOMER_PROOF"}}}});
    if (!inv) throw new HttpError(404, "NOT_FOUND", "Invoice not found.");
    if (!["ISSUED", "SENT", "PARTIALLY_PAID", "OVERDUE"].includes(inv.status)) throw new HttpError(409, "INVOICE_NOT_PAYABLE", "This invoice is not awaiting payment.");
    if (inv.transfers.length >= 5) throw new HttpError(429, "TOO_MANY_PENDING_PROOFS", "Several proofs are already waiting for Finance review.");
    const refHash = bankRefHash(x.bankReference);
    if (inv.transfers.some(t => t.bankReference === refHash)) throw new HttpError(409, "DUPLICATE_SUBMISSION", "This transfer reference was already submitted.");
    let proofUrl: string | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX) throw new HttpError(400, "FILE_TOO_LARGE", "Proof must not exceed 5 MB.");
      const bytes = Buffer.from(await file.arrayBuffer());
      if (!sniff(bytes, file.type)) throw new HttpError(415, "BAD_FILE_TYPE", "Upload PNG, JPG, WebP or PDF.");
      proofUrl = await storePrivate(bytes, PROOF_TYPES[file.type].ext);
    }
    const created = await db.$transaction(async tx => {
      const t = await tx.manualTransfer.create({data: {invoiceId: id, source: "CUSTOMER_PROOF", status: "PENDING_VERIFICATION",
        amountMinor: BigInt(x.amountMinor), bankReference: refHash, transferredAt: new Date(x.transferredAt), payerName: x.payerName,
        proofUrl, submittedByAccountId: acc.id}});
      await tx.notification.create({data: {audienceRole: "FINANCE", type: "PAYMENT_PROOF_UPLOADED", recordType: "Invoice", recordId: id}});
      await tx.notificationOutbox.create({data: {topic: "PAYMENT_PROOF_UPLOADED", dedupeKey: "proof:" + t.id, payload: {invoiceId: id}}});
      await tx.auditLog.create({data: {accountId: acc.id, action: "PAYMENT_PROOF_SUBMITTED", resourceType: "ManualTransfer", resourceId: t.id,
        afterState: {invoiceId: id, amountMinor: x.amountMinor, hasFile: !!proofUrl}}});
      return t;
    });
    return NextResponse.json({id: created.id, status: "PENDING_VERIFICATION",
      message: "Proof received. Your invoice stays unpaid until Finance confirms the funds in the organizer's bank account."},
      {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
