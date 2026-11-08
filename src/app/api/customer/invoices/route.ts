import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {customer} from "@/lib/auth";
import {bankDetails} from "@/lib/policy";
import {failure} from "@/lib/errors";
import {customerPaymentState} from "@/lib/finance-ledger";

const PAYABLE = ["ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"];
/** Owner-only invoices with server-derived payment state (FR-127/130). Bank details only after issue. */
export async function GET() {
  try {
    const acc = await customer();
    const records = await db.invoice.findMany({where: {accountId: acc.id, status: {not: "DRAFT"}}, orderBy: {createdAt: "desc"},
      include: {items: true, transfers: {select: {id: true, amountMinor: true, status: true, verifiedAt: true, source: true, transferredAt: true, createdAt: true, decisionReason: true}},
        adjustments: {select: {type: true, amountMinor: true, createdAt: true, reason: true}}}});
    const bank = records.some(x => PAYABLE.includes(x.status)) ? bankDetails() : null;
    return NextResponse.json({invoices: records.map(r => {
      const s = customerPaymentState(r, r.transfers, r.adjustments);
      return {
        id: r.id, number: r.number, status: r.status, issuedAt: r.issuedAt, dueAt: r.dueAt, cancelledAt: r.cancelledAt,
        totalMinor: r.totalMinor.toString(), minimumDpMinor: r.minimumDpMinor.toString(),
        items: r.items.map(i => ({description: i.description, quantity: i.quantity, unitPriceMinor: i.unitPriceMinor.toString(), amountMinor: i.amountMinor.toString()})),
        state: s.state, overdue: s.overdue, paidMinor: s.paidMinor, outstandingMinor: s.outstandingMinor, refundedMinor: s.refundedMinor,
        ledger: [
          ...r.transfers.filter(t => t.status === "VERIFIED").map(t => ({kind: "RECEIPT", amountMinor: t.amountMinor.toString(), at: t.verifiedAt})),
          ...r.adjustments.map(a => ({kind: a.type, amountMinor: a.amountMinor.toString(), at: a.createdAt}))
        ],
        proofs: r.transfers.filter(t => t.source === "CUSTOMER_PROOF").map(t => ({id: t.id, status: t.status, amountMinor: t.amountMinor.toString(),
          transferredAt: t.transferredAt, submittedAt: t.createdAt, note: t.status === "REJECTED" ? t.decisionReason : null})),
        bankDetails: PAYABLE.includes(r.status) ? bank : null
      };
    })}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
