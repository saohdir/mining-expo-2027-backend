"use client";
import {useConfirm, type ConfirmOptions} from "../components/Confirm";
import {useCallback, useEffect, useState} from "react";

type Ledger = {
  id: string; number: string; status: string; totalMinor: string;
  summary: {state: string; overdue: boolean; paidMinor: string; outstandingMinor: string; refundedMinor: string; pendingProofs: number};
  receipts: {id: string; source: string; status: string; amountMinor: string; transferredAt: string | null; approvalRequired: boolean; submittedBy: string | null; verifiedBy: string | null; decisionReason?: string | null; payerName?: string | null; hasProof: boolean; createdAt: string}[];
  adjustments: {id: string; type: string; transferId: string | null; amountMinor: string; reason: string; createdAt: string}[];
  deliveries: {id: string; channel: string; destinationMasked: string; status: string; createdAt: string; sentAt: string | null}[];
};
const rp = (v: string) => "Rp " + Number(v).toLocaleString("id-ID");
const wib = (d?: string | null) => d ? new Date(d).toLocaleString("en-GB", {timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short"}) + " WIB" : "—";
async function call(url: string, method = "GET", data?: unknown) {
  const r = await fetch(url, {method, cache: "no-store", headers: data ? {"Content-Type": "application/json"} : undefined, body: data ? JSON.stringify(data) : undefined});
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.message || body.error || "Request failed");
  return body;
}

/** Finance ledger (FR-128/129/131/132, AT-063/064/069/087): customer proofs, approvals,
 * append-only reversals/refunds, cancellation with entitlement revocation, delivery log. */
export function LedgerPanel({invoiceId, me, onChanged}: {invoiceId: string; me: {id?: string; role: string}; onChanged: () => void}) {
  const [l, setL] = useState<Ledger | null>(null), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(""), [amount, setAmount] = useState(""), [ref, setRef] = useState(""), [target, setTarget] = useState("");
  const finance = ["FINANCE", "SUPER_ADMIN"].includes(me.role);
  const load = useCallback(async () => { try { setL(await call("/api/admin/invoices/" + invoiceId + "/ledger")); } catch (e) { setMsg(e instanceof Error ? e.message : "Unable to load ledger"); } }, [invoiceId]);
  useEffect(() => { void load(); }, [load]);
  const ask = useConfirm();
  const act = async (fn: (why: string) => Promise<unknown>, ok: string, o: ConfirmOptions) => {
    const r = await ask({...o, reason: {min: 10, initial: reason.trim()}}); if (!r) return;
    setBusy(true); setMsg("");
    try { await fn(r.reason); setMsg(ok); setReason(""); setAmount(""); setRef(""); setTarget(""); await load(); onChanged(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  };
  if (!l) return <p className="micro">{msg || "Loading ledger…"}</p>;
  const pending = l.receipts.filter(r => r.status === "PENDING_VERIFICATION");
  const verified = l.receipts.filter(r => r.status === "VERIFIED");
  return <section className="cms-card ledger-panel" aria-label="Payment ledger">
    <h3>Ledger &amp; corrections</h3>
    <p className="micro">Customer view: <strong>{l.summary.state.replaceAll("_", " ")}</strong>{l.summary.overdue ? " · OVERDUE" : ""} · refunded {rp(l.summary.refundedMinor)}</p>
    <table className="cms-table"><thead><tr><th>Entry</th><th>Amount</th><th>Status</th><th>Date</th><th /></tr></thead><tbody>
      {l.receipts.map(r => <tr key={r.id}>
        <td>{r.source === "CUSTOMER_PROOF" ? "Customer proof" : "Finance receipt"}{r.approvalRequired ? " (needs 2nd approval)" : ""}{r.payerName ? " · " + r.payerName : ""}</td>
        <td>{rp(r.amountMinor)}</td><td>{r.status.replaceAll("_", " ")}{r.decisionReason ? " — " + r.decisionReason : ""}</td><td>{wib(r.transferredAt || r.createdAt)}</td>
        <td>{r.hasProof && finance && <a href={"/api/admin/manual-transfers/" + r.id + "/proof"} target="_blank" rel="noreferrer">View proof</a>}</td></tr>)}
      {l.adjustments.map(a => <tr key={a.id}><td>{a.type === "REVERSAL" ? "Correction (reversal)" : "Refund payout"}</td><td>−{rp(a.amountMinor)}</td><td>{a.reason}</td><td>{wib(a.createdAt)}</td><td /></tr>)}
    </tbody></table>
    {finance && <div className="form-grid">
      <label>Reason / audit note (optional here; asked again when you confirm)<textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={400} /></label>
      {pending.map(p => <div key={p.id} className="cms-row-actions">
        <span className="micro">{p.source === "CUSTOMER_PROOF" ? "Proof" : "Receipt"} {rp(p.amountMinor)} pending.</span>
        {p.approvalRequired ? <button disabled={busy} onClick={() => void act(why => call("/api/admin/manual-transfers/" + p.id + "/approve", "POST", {reason: why}), "Second approval recorded.", {title: `Approve the ${rp(p.amountMinor)} receipt?`, tone: "warning", confirmLabel: "Yes, approve receipt", changes: ["The receipt becomes VERIFIED and the invoice balance is recalculated."], impact: ["The customer is notified that payment was verified.", "Paid bookings may be confirmed and passes issued automatically."]})}>Approve receipt</button>
          : p.source === "CUSTOMER_PROOF" && <>
            <input aria-label="Amount on bank statement (IDR)" placeholder="Amount on bank statement" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ""))} />
            <input aria-label="Bank statement reference" placeholder="Bank statement reference" value={ref} onChange={e => setRef(e.target.value)} />
            <button disabled={busy || !amount || ref.length < 4} onClick={() => void act(why => call("/api/admin/invoices/" + invoiceId + "/verify-transfer", "POST",
              {amountMinor: amount, bankReference: ref, transferredAt: p.transferredAt || new Date().toISOString(), bankVerified: true, reason: why, proofTransferId: p.id}), "Funds verified against bank statement.", {title: `Verify ${rp(amount || "0")} against the bank statement?`, tone: "warning", confirmLabel: "Yes, verify funds", changes: [`A verified receipt of ${rp(amount || "0")} (reference ${ref}) is added to the ledger.`], impact: ["The invoice balance and status change; the customer is notified.", "Large amounts may need a second approver (maker-checker)."]})}>Verify this proof (bank checked)</button></>}
        <button className="ghost" disabled={busy} onClick={() => void act(why => call("/api/admin/manual-transfers/" + p.id + "/reject", "POST", {reason: why}), "Marked as not matched.", {title: "Reject this proof or receipt?", tone: "danger", confirmLabel: "Yes, reject", changes: ["It is marked as not matched and does not count toward the paid amount."], impact: ["The customer sees that the transfer could not be matched and may send a new proof."]})}>Reject</button>
      </div>)}
      {verified.length > 0 && <fieldset><legend>Reverse a misposted receipt (append-only)</legend>
        <label>Receipt<select value={target} onChange={e => setTarget(e.target.value)}><option value="">Choose receipt</option>{verified.map(r => <option key={r.id} value={r.id}>{rp(r.amountMinor)} · {wib(r.transferredAt)}</option>)}</select></label>
        <label>Amount to reverse (IDR)<input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ""))} /></label>
        <button disabled={busy || !target || !amount} onClick={() => void act(why => call("/api/admin/invoices/" + invoiceId + "/adjustments", "POST", {type: "REVERSAL", transferId: target, amountMinor: amount, reason: why}), "Reversal appended.", {title: `Reverse ${rp(amount || "0")}?`, tone: "danger", confirmLabel: "Yes, append reversal", changes: ["A correction entry reduces the verified amount (append-only, the original receipt stays)."], impact: ["The invoice may return to awaiting payment; paid bookings may lose confirmation."]})}>Append reversal</button>
      </fieldset>}
      {["CANCELLED", "VOID"].includes(l.status) && l.summary.state === "REFUND_PENDING" && <fieldset><legend>Record executed refund payout</legend>
        <label>Refund amount (IDR)<input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ""))} /></label>
        <label>Outgoing bank reference<input value={ref} onChange={e => setRef(e.target.value)} /></label>
        <button disabled={busy || !amount || ref.length < 4} onClick={() => void act(why => call("/api/admin/invoices/" + invoiceId + "/adjustments", "POST", {type: "REFUND", amountMinor: amount, payoutReference: ref, reason: why, bankVerified: true}), "Refund recorded.", {title: `Record a refund payout of ${rp(amount || "0")}?`, tone: "danger", confirmLabel: "Yes, record refund", changes: [`Refund with outgoing bank reference ${ref} is added to the ledger.`], impact: ["The customer sees the invoice as refunded.", "Only record this after the bank transfer was actually sent."]})}>Record refund (bank payout confirmed)</button>
      </fieldset>}
      {["ISSUED", "SENT", "OVERDUE"].includes(l.status) && l.summary.paidMinor === "0" && <fieldset><legend>Revise invoice (FR-125)</legend>
        <p className="micro">Issued invoices are never edited: this voids the current invoice and creates a new draft with the same items for you to adjust and issue.</p>
        <button className="ghost" disabled={busy} onClick={() => void act(why => call("/api/admin/invoices/" + invoiceId + "/revise", "POST", {reason: why}), "Invoice voided; new draft created in Invoices.", {title: "Void this invoice and create a revised draft?", tone: "danger", confirmLabel: "Yes, void and revise", changes: ["The current invoice becomes VOID.", "A new draft with the same items is created for you to edit and issue."], impact: ["The customer can no longer pay the voided invoice."]})}>Void &amp; create revised draft</button>
      </fieldset>}
      {!["CANCELLED", "VOID"].includes(l.status) && <fieldset><legend>Cancel invoice</legend>
        <p className="micro">Verified receipts stay in the ledger; the customer sees “refund pending” until a payout is recorded.</p>
        <button className="ghost" disabled={busy} onClick={() => void act(why => call("/api/admin/invoices/" + invoiceId + "/cancel", "POST", {reason: why, cancelBooking: false}), "Invoice cancelled.", {title: "Cancel this invoice only?", tone: "danger", confirmLabel: "Yes, cancel invoice", changes: ["The invoice is cancelled; the booking stays."], impact: ["Verified receipts stay in the ledger; the customer sees refund pending until a payout is recorded."]})}>Cancel invoice only</button>
        <button className="ghost" disabled={busy} onClick={() => void act(why => call("/api/admin/invoices/" + invoiceId + "/cancel", "POST", {reason: why, cancelBooking: true}), "Invoice and booking cancelled; passes revoked.", {title: "Cancel the invoice AND the booking?", tone: "danger", confirmLabel: "Yes, cancel both", typed: "CANCEL", changes: ["The invoice and its booking are cancelled.", "Event passes linked to the booking are revoked."], impact: ["The customer can no longer enter with those passes.", "Booth units are released if they were assigned.", "Verified receipts stay; record a refund payout separately."]})}>Cancel invoice and booking (revoke passes)</button>
      </fieldset>}
    </div>}
    <h4>Delivery history</h4>
    {l.deliveries.length ? <ul className="micro">{l.deliveries.map(d => <li key={d.id}>{d.channel} → {d.destinationMasked} · {d.status} · {wib(d.sentAt || d.createdAt)}</li>)}</ul> : <p className="micro">Not shared yet.</p>}
    {msg && <p role="status" className="micro">{msg}</p>}
  </section>;
}
