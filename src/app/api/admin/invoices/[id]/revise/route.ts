import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {ledgerTotals} from "@/lib/finance-ledger";

const item = z.object({description: z.string().min(3).max(200), quantity: z.number().int().min(1).max(100), unitPriceMinor: z.string().regex(/^\d+$/)}).strict();
const schema = z.object({reason: z.string().trim().min(10).max(400), items: z.array(item).min(1).max(30).optional(), minimumDpMinor: z.string().regex(/^\d+$/).optional(), dueAt: z.string().datetime().optional()}).strict();
/** FR-065/125: an issued invoice is never edited. Revision VOIDs it and creates a new DRAFT linked by
 * revisionOfId. Not allowed once money was received (reverse/refund first). Booth totals must equal the accepted quote. */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["FINANCE", "SUPER_ADMIN"]);
    const {id} = await params; z.string().uuid().parse(id);
    const x = schema.parse(await req.json());
    const out = await db.$transaction(async tx => {
      const inv = await tx.invoice.findUnique({where: {id}, include: {items: true, transfers: true, adjustments: true}});
      if (!inv) throw new HttpError(404, "NOT_FOUND", "Invoice missing.");
      if (!["ISSUED", "SENT", "OVERDUE"].includes(inv.status)) throw new HttpError(409, "NOT_REVISABLE", "Only issued, unpaid invoices can be revised.");
      if (ledgerTotals(inv.totalMinor, inv.transfers, inv.adjustments).paid > 0n || inv.transfers.some(t => t.status === "PENDING_VERIFICATION")) throw new HttpError(409, "HAS_PAYMENTS", "Reverse or resolve payments before revising.");
      const items = (x.items ?? inv.items.map(i => ({description: i.description, quantity: i.quantity, unitPriceMinor: i.unitPriceMinor.toString()}))).map(i => ({description: i.description, quantity: i.quantity, unitPriceMinor: BigInt(i.unitPriceMinor), amountMinor: BigInt(i.unitPriceMinor) * BigInt(i.quantity)}));
      const total = items.reduce((a, i) => a + i.amountMinor, 0n);
      if (inv.boothRequestId) {
        const offer = await tx.boothOffer.findFirst({where: {boothRequestId: inv.boothRequestId}, orderBy: {revision: "desc"}});
        if (!offer?.acceptedAt || offer.quotedPriceMinor !== total) throw new HttpError(409, "QUOTE_PRICE_MISMATCH", "Booth invoice must equal the latest accepted quotation. Issue a new quotation first.");
      }
      await tx.invoice.update({where: {id}, data: {status: "VOID", cancelledAt: new Date(), cancelReason: "REVISED: " + x.reason}});
      const created = await tx.invoice.create({data: {number: "DRAFT-" + crypto.randomUUID(), accountId: inv.accountId, enrollmentId: inv.enrollmentId, boothRequestId: inv.boothRequestId, status: "DRAFT",
        totalMinor: total, minimumDpMinor: x.minimumDpMinor ? BigInt(x.minimumDpMinor) : inv.minimumDpMinor, dueAt: x.dueAt ? new Date(x.dueAt) : inv.dueAt, revisionOfId: id, items: {create: items}}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "INVOICE_REVISED", resourceType: "Invoice", resourceId: id, beforeState: {status: inv.status, totalMinor: inv.totalMinor.toString()},
        afterState: {status: "VOID", newDraftId: created.id, totalMinor: total.toString(), reason: x.reason}}});
      return {voided: id, draftId: created.id, totalMinor: total.toString()};
    });
    return NextResponse.json({...out, message: "Previous invoice voided. Issue the new draft to send it."}, {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
