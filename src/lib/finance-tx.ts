import {Prisma} from "@prisma/client";
import {createHash} from "node:crypto";
import {ledgerTotals} from "./finance-ledger";
import {HttpError} from "./errors";
import {issueConferencePasses, revokeEnrollmentPasses} from "./passes";

type Tx = Prisma.TransactionClient;
export const bankRefHash = (ref: string) => createHash("sha256").update(ref.trim().toUpperCase()).digest("hex");
export const isWriteConflict = (e: unknown) =>
  typeof e === "object" && e !== null && "code" in e && ["P2034", "P2002"].includes(String((e as {code?: unknown}).code));

/** Recompute invoice status from the append-only ledger inside the caller's transaction. */
export async function recomputeInvoice(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({where: {id: invoiceId}, include: {transfers: true, adjustments: true}});
  const t = ledgerTotals(inv.totalMinor, inv.transfers, inv.adjustments);
  if (["CANCELLED", "VOID", "DRAFT"].includes(inv.status)) return {invoice: inv, totals: t};
  const next = t.invoiceState === "SENT" ? (inv.sentAt ? "SENT" : "ISSUED") : t.invoiceState;
  if (next !== inv.status) await tx.invoice.update({where: {id: invoiceId}, data: {status: next}});
  // FR-023/073, AT-066: paid conference access follows full settlement by default.
  if (inv.enrollmentId && next !== inv.status && process.env.CONFERENCE_ACCESS_ON_DP !== "true") {
    const e = await tx.enrollment.findUnique({where: {id: inv.enrollmentId}});
    if (e?.type === "CONFERENCE") {
      if (next === "PAID" && ["SUBMITTED", "PENDING_REVIEW"].includes(e.status)) {
        await tx.enrollment.update({where: {id: e.id}, data: {status: "CONFIRMED", confirmedAt: new Date()}});
        await issueConferencePasses(tx, e.id);
        await tx.auditLog.create({data: {action: "CONFERENCE_CONFIRMED_ON_FULL_PAYMENT", resourceType: "Enrollment", resourceId: e.id, afterState: {invoiceId}}});
      } else if (inv.status === "PAID" && next !== "PAID" && e.status === "CONFIRMED") {
        await tx.enrollment.update({where: {id: e.id}, data: {status: "PENDING_REVIEW"}});
        const n = await revokeEnrollmentPasses(tx, e.id, "PAYMENT_REVERSED");
        await tx.auditLog.create({data: {action: "CONFERENCE_ACCESS_SUSPENDED", resourceType: "Enrollment", resourceId: e.id, afterState: {invoiceId, revokedPasses: n}}});
      }
    }
  }
  return {invoice: {...inv, status: next}, totals: t};
}

/** AT-068: one bank reference may be VERIFIED once across every invoice. */
export async function assertReferenceUnused(tx: Tx, refHash: string, exceptTransferId?: string) {
  const used = await tx.manualTransfer.findFirst({where: {bankReference: refHash, status: "VERIFIED", ...(exceptTransferId ? {id: {not: exceptTransferId}} : {})}, select: {id: true, invoiceId: true}});
  if (used) throw new HttpError(409, "DUPLICATE_BANK_REFERENCE", "This bank reference is already verified. Investigate before crediting.");
}

export async function queueCustomerNotice(tx: Tx, topic: string, invoiceId: string, key: string) {
  await tx.notificationOutbox.create({data: {topic, dedupeKey: topic + ":" + key, payload: {invoiceId}}});
}
