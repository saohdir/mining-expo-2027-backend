"use client";
import {useEffect, useState} from "react";
const call = async (u: string, m = "GET", b?: unknown) => { const r = await fetch(u, {method: m, cache: "no-store", headers: b ? {"Content-Type": "application/json"} : undefined, body: b ? JSON.stringify(b) : undefined}); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || j.issues?.map((i: {field: string; message: string}) => i.field + ": " + i.message).join("; ") || "Request failed"); return j; };
const EXAMPLE = {charges: [{code: "VAT", label: "VAT", kind: "TAX", rateBps: 1100, appliesTo: ["BOOTH", "CONFERENCE"]}], approvedBy: "", approvedAt: ""};

/** FR-125: taxes/fees added to new invoice drafts (only once approved by Finance/Legal, D-01). */
export default function InvoiceChargesAdmin() {
  const [text, setText] = useState(""), [active, setActive] = useState(false), [reason, setReason] = useState(""), [msg, setMsg] = useState("");
  useEffect(() => { call("/api/admin/invoice-charges").then(j => { setActive(Boolean(j.config)); setText(JSON.stringify(j.config ?? EXAMPLE, null, 2)); }).catch(e => setMsg(e.message)); }, []);
  const save = async (clear: boolean) => { setMsg(""); try { await call("/api/admin/invoice-charges", "PUT", {config: clear ? null : JSON.parse(text), reason}); setActive(!clear); setMsg(clear ? "No taxes/fees will be added to new drafts." : "Saved (audited). Applies to new drafts and revisions only."); } catch (e) { setMsg((e as Error).message); } };
  return <main className="cms-page"><header><p className="eyebrow">FINANCE</p><h1>Invoice taxes & fees</h1>
    <p>Status: <strong>{active ? "ACTIVE — added to new drafts" : "none configured"}</strong>. Rates in basis points (1100 = 11%) or a fixed amount in whole IDR; computed on the item subtotal. Issued invoices are never changed; revise them to apply new rules. Booth quotations are compared with the item subtotal.</p></header>
    <label>Configuration (JSON)<textarea rows={16} value={text} onChange={e => setText(e.target.value)} spellCheck={false} /></label>
    <label>Reason / approval reference<input value={reason} onChange={e => setReason(e.target.value)} /></label>
    <div className="cms-row-actions"><button disabled={reason.length < 8} onClick={() => void save(false)}>Save</button><button className="ghost" disabled={reason.length < 8} onClick={() => void save(true)}>Remove all charges</button></div>
    {msg && <p role="status" className="micro">{msg}</p>}
  </main>;
}
