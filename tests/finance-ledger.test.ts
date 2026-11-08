import {test} from "node:test";
import assert from "node:assert/strict";
import {ledgerTotals, customerPaymentState, needsSecondApproval, reversibleAmount, maskDestination} from "../src/lib/finance-ledger";

const V = (n: number) => ({amountMinor: BigInt(n), status: "VERIFIED"});
test("paid = verified receipts minus reversals; proofs never count as paid", () => {
  const t = ledgerTotals(100n, [V(30), {amountMinor: 70n, status: "PENDING_VERIFICATION"}], [{type: "REVERSAL", amountMinor: 10n}]);
  assert.equal(t.paid, 20n); assert.equal(t.outstanding, 80n); assert.equal(t.invoiceState, "PARTIALLY_PAID"); assert.equal(t.pendingProofs, 1);
  assert.equal(ledgerTotals(100n, [V(100)], [{type: "REVERSAL", amountMinor: 100n}]).invoiceState, "SENT");
  assert.throws(() => ledgerTotals(100n, [V(10)], [{type: "REVERSAL", amountMinor: 20n}]));
});
test("customer states: awaiting, DP, paid, cancelled, refund pending/refunded, overdue flag", () => {
  const inv = (status: string, dueAt?: Date) => ({status, totalMinor: 100n, dueAt});
  assert.equal(customerPaymentState(inv("DRAFT"), []).state, "NOT_INVOICED");
  assert.equal(customerPaymentState(inv("SENT"), []).state, "AWAITING_PAYMENT");
  assert.equal(customerPaymentState(inv("PARTIALLY_PAID"), [V(40)]).state, "DP_RECEIVED");
  assert.equal(customerPaymentState(inv("PAID"), [V(100)]).state, "PAID_IN_FULL");
  assert.equal(customerPaymentState(inv("CANCELLED"), []).state, "CANCELLED");
  const c = customerPaymentState(inv("CANCELLED"), [V(40)]);
  assert.equal(c.state, "REFUND_PENDING"); assert.equal(c.outstandingMinor, "0");
  assert.equal(customerPaymentState(inv("CANCELLED"), [V(40)], [{type: "REFUND", amountMinor: 40n}]).state, "REFUNDED");
  assert.equal(customerPaymentState(inv("SENT", new Date("2026-01-01")), [], [], new Date("2026-02-01")).overdue, true);
  assert.equal(customerPaymentState(inv("PAID", new Date("2026-01-01")), [V(100)], [], new Date("2026-02-01")).overdue, false);
});
test("maker-checker threshold is opt-in", () => {
  assert.equal(needsSecondApproval(10n ** 12n, null), false);
  assert.equal(needsSecondApproval(100n, 100n), true);
  assert.equal(needsSecondApproval(99n, 100n), false);
});
test("reversal bounded by remaining verified receipt", () => {
  assert.equal(reversibleAmount(V(100), [30n]), 70n);
  assert.equal(reversibleAmount(V(100), [100n]), 0n);
  assert.equal(reversibleAmount({amountMinor: 100n, status: "PENDING_VERIFICATION"}, []), 0n);
});
test("destinations are masked for delivery logs", () => {
  assert.equal(maskDestination("buyer@example.com"), "bu***@example.com");
  assert.equal(maskDestination("+6281234567890"), "***7890");
});
