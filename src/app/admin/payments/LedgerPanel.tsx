"use client";
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
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg("");
    try { await fn(); setMsg(ok); setReason(""); setAmount(""); setRef(""); setTarget(""); await load(); onChanged(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  };
  if (!l) return <p className="micro">{msg || "Loading ledger…"}</p>;
  const pending = l.receipts.filter(r => r.status === "PENDING_VERIFICATION");
  const verified = l.receipts.filter(r => r.status === "VERIFIED");
  const reasonOk = reason.trim().length >= 10;
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
      <label>Reason / audit note (required, min 10 chars)<textarea value={reason} onChange={e => setReason(e.target.value)} maxLength={400} /></label>
      {pending.map(p => <div key={p.id} className="cms-row-actions">
        <span className="micro">{p.source === "CUSTOMER_PROOF" ? "Proof" : "Receipt"} {rp(p.amountMinor)} pending.</span>
        {p.approvalRequired ? <button disabled={busy || !reasonOk} onClick={() => void act(() => call("/api/admin/manual-transfers/" + p.id + "/approve", "POST", {reason}), "Second approval recorded.")}>Approve receipt</button>
          : p.source === "CUSTOMER_PROOF" && <>
            <input aria-label="Amount on bank statement (IDR)" placeholder="Amount on bank statement" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ""))} />
            <input aria-label="Bank statement reference" placeholder="Bank statement reference" value={ref} onChange={e => setRef(e.target.value)} />
            <button disabled={busy || !reasonOk || !amount || ref.length < 4} onClick={() => void act(() => call("/api/admin/invoices/" + invoiceId + "/verify-transfer", "POST",
              {amountMinor: amount, bankReference: ref, transferredAt: p.transferredAt || new Date().toISOString(), bankVerified: true, reason, proofTransferId: p.id}), "Funds verified against bank statement.")}>Verify this proof (bank checked)</button></>}
        <button className="ghost" disabled={busy || !reasonOk} onClick={() => void act(() => call("/api/admin/manual-transfers/" + p.id + "/reject", "POST", {reason}), "Marked as not matched.")}>Reject</button>
      </div>)}
      {verified.length > 0 && <fieldset><legend>Reverse a misposted receipt (append-only)</legend>
        <label>Receipt<select value={target} onChange={e => setTarget(e.target.value)}><option value="">Choose receipt</option>{verified.map(r => <option key={r.id} value={r.id}>{rp(r.amountMinor)} · {wib(r.transferredAt)}</option>)}</select></label>
        <label>Amount to reverse (IDR)<input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ""))} /></label>
        <button disabled={busy || !reasonOk || !target || !amount} onClick={() => void act(() => call("/api/admin/invoices/" + invoiceId + "/adjustments", "POST", {type: "REVERSAL", transferId: target, amountMinor: amount, reason}), "Reversal appended.")}>Append reversal</button>
      </fieldset>}
      {["CANCELLED", "VOID"].includes(l.status) && l.summary.state === "REFUND_PENDING" && <fieldset><legend>Record executed refund payout</legend>
        <label>Refund amount (IDR)<input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ""))} /></label>
        <label>Outgoing bank reference<input value={ref} onChange={e => setRef(e.target.value)} /></label>
        <button disabled={busy || !reasonOk || !amount || ref.length < 4} onClick={() => void act(() => call("/api/admin/invoices/" + invoiceId + "/adjustments", "POST", {type: "REFUND", amountMinor: amount, payoutReference: ref, reason, bankVerified: true}), "Refund recorded.")}>Record refund (bank payout confirmed)</button>
      </fieldset>}
      {!["CANCELLED", "VOID"].includes(l.status) && <fieldset><legend>Cancel invoice</legend>
        <p className="micro">Verified receipts stay in the ledger; the customer sees “refund pending” until a payout is recorded.</p>
        <button className="ghost" disabled={busy || !reasonOk} onClick={() => void act(() => call("/api/admin/invoices/" + invoiceId + "/cancel", "POST", {reason, cancelBooking: false}), "Invoice cancelled.")}>Cancel invoice only</button>
        <button className="ghost" disabled={busy || !reasonOk} onClick={() => void act(() => call("/api/admin/invoices/" + invoiceId + "/cancel", "POST", {reason, cancelBooking: true}), "Invoice and booking cancelled; passes revoked.")}>Cancel invoice and booking (revoke passes)</button>
      </fieldset>}
    </div>}
    <h4>Delivery history</h4>
    {l.deliveries.length ? <ul className="micro">{l.deliveries.map(d => <li key={d.id}>{d.channel} → {d.destinationMasked} · {d.status} · {wib(d.sentAt || d.createdAt)}</li>)}</ul> : <p className="micro">Not shared yet.</p>}
    {msg && <p role="status" className="micro">{msg}</p>}
  </section>;
}
