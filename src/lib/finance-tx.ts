import {Prisma} from "@prisma/client";
import {createHash} from "node:crypto";
import {ledgerTotals} from "./finance-ledger";
import {HttpError} from "./errors";

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
