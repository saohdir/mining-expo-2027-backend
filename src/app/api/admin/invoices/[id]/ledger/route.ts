import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {customerPaymentState} from "@/lib/finance-ledger";

/** Invoice ledger: receipts, proofs, corrections, deliveries and audit (FR-051/126/129/131). */
export async function GET(_req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "FINANCE", "SALES", "OPERATIONS"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const inv = await db.invoice.findUnique({where: {id}, include: {transfers: {orderBy: {createdAt: "asc"}}, adjustments: {orderBy: {createdAt: "asc"}}, deliveries: {orderBy: {createdAt: "desc"}}}});
    if (!inv) throw new HttpError(404, "NOT_FOUND", "Invoice missing.");
    const finance = ["SUPER_ADMIN", "FINANCE"].includes(actor.role);
    const audit = await db.auditLog.findMany({where: {OR: [{resourceId: id}, {resourceId: {in: inv.transfers.map(t => t.id)}}]}, orderBy: {createdAt: "asc"}, take: 200,
      select: {action: true, adminId: true, createdAt: true, afterState: finance}});
    return NextResponse.json({
      id: inv.id, number: inv.number, status: inv.status, totalMinor: inv.totalMinor.toString(),
      summary: customerPaymentState(inv, inv.transfers, inv.adjustments),
      receipts: inv.transfers.map(t => ({id: t.id, source: t.source, status: t.status, amountMinor: t.amountMinor.toString(), transferredAt: t.transferredAt,
        approvalRequired: t.approvalRequired, submittedBy: t.submittedBy, verifiedBy: t.verifiedBy, verifiedAt: t.verifiedAt,
        decisionReason: finance ? t.decisionReason : undefined, payerName: finance ? t.payerName : undefined, hasProof: !!t.proofUrl, createdAt: t.createdAt})),
      adjustments: inv.adjustments.map(a => ({id: a.id, type: a.type, transferId: a.transferId, amountMinor: a.amountMinor.toString(), reason: a.reason, approvedBy: a.approvedBy, createdAt: a.createdAt})),
      deliveries: inv.deliveries.map(d => ({id: d.id, channel: d.channel, destinationMasked: d.destinationMasked, status: d.status, sentBy: d.sentBy, createdAt: d.createdAt, sentAt: d.sentAt})),
      audit
    }, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
