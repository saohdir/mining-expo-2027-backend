/**
 * Append-only manual payment ledger (PRD v1.4 §5.2, FR-049/129/130/131).
 * Paid = VERIFIED receipts − REVERSAL adjustments. Refunds are a separate
 * payout record after cancellation and never change the receipt history.
 */
export type LedgerReceipt = {amountMinor: bigint; status: string};
export type LedgerAdjustment = {type: string; amountMinor: bigint; transferId?: string | null};
export type CustomerPaymentState =
  | "NOT_INVOICED" | "AWAITING_PAYMENT" | "DP_RECEIVED" | "PAID_IN_FULL"
  | "CANCELLED" | "REFUND_PENDING" | "REFUNDED";

export function ledgerTotals(total: bigint, receipts: LedgerReceipt[], adjustments: LedgerAdjustment[] = []) {
  if (total < 0n) throw new Error("Negative invoice");
  const verified = receipts.filter(r => r.status === "VERIFIED").reduce((a, r) => a + r.amountMinor, 0n);
  const reversed = adjustments.filter(a => a.type === "REVERSAL").reduce((a, r) => a + r.amountMinor, 0n);
  const refunded = adjustments.filter(a => a.type === "REFUND").reduce((a, r) => a + r.amountMinor, 0n);
  const paid = verified - reversed;
  if (paid < 0n) throw new Error("Negative net receipts");
  const outstanding = total > paid ? total - paid : 0n;
  const invoiceState: "SENT" | "PARTIALLY_PAID" | "PAID" = paid === 0n ? "SENT" : paid >= total ? "PAID" : "PARTIALLY_PAID";
  return {paid, outstanding, refunded, reversed, invoiceState,
    pendingProofs: receipts.filter(r => r.status === "PENDING_VERIFICATION").length};
}

/** Customer-facing financial summary (FR-130). Overdue is a separate flag. */
export function customerPaymentState(
  invoice: {status: string; dueAt?: Date | null; totalMinor: bigint},
  receipts: LedgerReceipt[], adjustments: LedgerAdjustment[] = [], now = new Date()
): {state: CustomerPaymentState; overdue: boolean; paidMinor: string; outstandingMinor: string; refundedMinor: string; pendingProofs: number} {
  const t = ledgerTotals(invoice.totalMinor, receipts, adjustments);
  let state: CustomerPaymentState;
  if (invoice.status === "DRAFT") state = "NOT_INVOICED";
  else if (["CANCELLED", "VOID"].includes(invoice.status)) {
    state = t.paid === 0n ? "CANCELLED" : t.refunded >= t.paid ? "REFUNDED" : "REFUND_PENDING";
  } else state = t.paid === 0n ? "AWAITING_PAYMENT" : t.paid >= invoice.totalMinor ? "PAID_IN_FULL" : "DP_RECEIVED";
  const overdue = !!invoice.dueAt && invoice.dueAt < now && ["AWAITING_PAYMENT", "DP_RECEIVED"].includes(state);
  return {state, overdue, paidMinor: t.paid.toString(), outstandingMinor: state.startsWith("REFUND") || state === "CANCELLED" ? "0" : t.outstanding.toString(),
    refundedMinor: t.refunded.toString(), pendingProofs: t.pendingProofs};
}

/** Maker-checker (FR-132, D-11). Disabled unless FINANCE_APPROVAL_THRESHOLD_MINOR is set. */
export function approvalThreshold(): bigint | null {
  const raw = process.env.FINANCE_APPROVAL_THRESHOLD_MINOR?.trim();
  if (!raw) return null;
  if (!/^[1-9]\d*$/.test(raw)) throw new Error("FINANCE_APPROVAL_THRESHOLD_MINOR must be a positive integer");
  return BigInt(raw);
}
export function needsSecondApproval(amount: bigint, threshold = approvalThreshold()) {
  return threshold !== null && amount >= threshold;
}

/** Reversal may not exceed what remains of the original verified receipt. */
export function reversibleAmount(receipt: {amountMinor: bigint; status: string}, priorReversals: bigint[]) {
  if (receipt.status !== "VERIFIED") return 0n;
  const left = receipt.amountMinor - priorReversals.reduce((a, b) => a + b, 0n);
  return left > 0n ? left : 0n;
}

export function maskDestination(value: string) {
  if (value.includes("@")) { const [u, d] = value.split("@"); return (u.slice(0, 2) || "*") + "***@" + d; }
  const digits = value.replace(/\D/g, ""); return "***" + digits.slice(-4);
}
