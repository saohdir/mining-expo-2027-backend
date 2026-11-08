"use client";
import {useState} from "react";

export type CustomerInvoice = {
  id: string; number: string; status: string; totalMinor: string; outstandingMinor: string; paidMinor: string; refundedMinor: string;
  minimumDpMinor: string; dueAt?: string | null; state: string; overdue: boolean;
  bankDetails?: {name: string; owner: string; number: string} | null;
  ledger: {kind: string; amountMinor: string; at: string | null}[];
  proofs: {id: string; status: string; amountMinor: string; transferredAt: string | null; submittedAt: string; note: string | null}[];
};
const money = (v: string) => "Rp " + Number(v).toLocaleString("id-ID", {maximumFractionDigits: 0});
const label: Record<string, string> = {
  NOT_INVOICED: "Not invoiced", AWAITING_PAYMENT: "Awaiting payment", DP_RECEIVED: "DP received", PAID_IN_FULL: "Paid in full",
  CANCELLED: "Cancelled", REFUND_PENDING: "Cancelled — refund pending", REFUNDED: "Cancelled — refunded"
};
const wib = (d?: string | null) => d ? new Date(d).toLocaleString("en-GB", {timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short"}) + " WIB" : "—";

/** Customer invoice card: bank instructions after issue, server-derived state, ledger and
 * optional transfer proof (FR-127/128/130). A proof never changes the paid status. */
export function InvoicePanel({invoice, onChanged}: {invoice: CustomerInvoice; onChanged: () => void}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  const payable = ["AWAITING_PAYMENT", "DP_RECEIVED"].includes(invoice.state);
  async function submit(form: HTMLFormElement) {
    setBusy(true); setMsg("");
    try {
      const fd = new FormData(form);
      const amount = String(fd.get("amount") || "").replace(/\D/g, "");
      fd.set("amountMinor", amount); fd.delete("amount");
      const when = String(fd.get("transferredAt") || "");
      fd.set("transferredAt", when ? new Date(when).toISOString() : "");
      const file = fd.get("file"); if (file instanceof File && file.size === 0) fd.delete("file");
      if (!fd.get("payerName")) fd.delete("payerName");
      const r = await fetch("/api/customer/invoices/" + invoice.id + "/payment-proof", {method: "POST", body: fd});
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.message || (body.issues ? body.issues.map((i: {field: string; message: string}) => i.field + ": " + i.message).join("; ") : "Upload failed"));
      setMsg(body.message); setOpen(false); form.reset(); onChanged();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Upload failed"); } finally { setBusy(false); }
  }
  return <div className="record invoice-card" data-invoice={invoice.number}>
    <div>
      <strong>{invoice.number}</strong>
      <p className="micro">Total {money(invoice.totalMinor)} · Confirmed {money(invoice.paidMinor)} · Outstanding {money(invoice.outstandingMinor)}
        {invoice.minimumDpMinor !== "0" && <> · Minimum DP {money(invoice.minimumDpMinor)}</>} · Due {wib(invoice.dueAt)}</p>
      {invoice.overdue && <p className="micro warning" role="status">Payment is overdue. Contact the organizer if you have already transferred.</p>}
      {invoice.bankDetails && payable && <p className="micro"><strong>Approved transfer destination</strong>: {invoice.bankDetails.name} · {invoice.bankDetails.owner} · {invoice.bankDetails.number}. Use invoice number {invoice.number} as the transfer reference.</p>}
      {invoice.ledger.length > 0 && <ul className="micro" aria-label="Payment ledger">{invoice.ledger.map((l, i) =>
        <li key={i}>{l.kind === "RECEIPT" ? "Verified receipt" : l.kind === "REVERSAL" ? "Correction (reversal)" : "Refund paid"} {money(l.amountMinor)} · {wib(l.at)}</li>)}</ul>}
      {invoice.proofs.length > 0 && <ul className="micro" aria-label="Submitted transfer proofs">{invoice.proofs.map(p =>
        <li key={p.id}>Proof {money(p.amountMinor)} sent {wib(p.submittedAt)} — {p.status === "PENDING_VERIFICATION" ? "waiting for Finance verification (not yet paid)" : p.status === "VERIFIED" ? "verified by Finance" : "not matched: " + (p.note || "contact Finance")}</li>)}</ul>}
      <a href={"/api/customer/invoices/" + invoice.id + "/pdf"} target="_blank" rel="noreferrer">Download invoice PDF</a>
      {invoice.paidMinor !== "0" && <> · <a href={"/api/customer/invoices/" + invoice.id + "/receipt"} target="_blank" rel="noreferrer">Download payment receipt</a></>}
      {payable && <> {" · "}<button type="button" className="link" aria-expanded={open} onClick={() => setOpen(v => !v)}>I have transferred — send proof (optional)</button></>}
      {open && <form className="form-grid" onSubmit={e => { e.preventDefault(); void submit(e.currentTarget); }}>
        <label>Amount transferred (IDR)<input name="amount" inputMode="numeric" required pattern="[0-9.,]+" /></label>
        <label>Bank transfer reference<input name="bankReference" required minLength={4} maxLength={120} /></label>
        <label>Transfer date and time<input name="transferredAt" type="datetime-local" required /></label>
        <label>Account holder name (optional)<input name="payerName" maxLength={160} /></label>
        <label>Proof file (PNG, JPG, WebP or PDF, max 5 MB, optional)<input name="file" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" /></label>
        <p className="micro">Submitting proof does not mark the invoice as paid. Finance confirms payment only after checking the organizer bank statement.</p>
        <button disabled={busy}>Send proof for verification</button>
      </form>}
      {msg && <p className="micro" role="status">{msg}</p>}
    </div>
    <span className="status">{label[invoice.state] || invoice.state}</span>
  </div>;
}
