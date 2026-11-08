"use client";
import {useEffect, useState} from "react";
const call = async (u: string, m = "GET", b?: unknown) => { const r = await fetch(u, {method: m, cache: "no-store", headers: b ? {"Content-Type": "application/json"} : undefined, body: b ? JSON.stringify(b) : undefined}); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || j.issues?.map((i: {field: string; message: string}) => i.field + ": " + i.message).join("; ") || "Request failed"); return j; };
const EXAMPLE = {currency: "IDR", categories: [{name: "Standard", perSqmMinor: "0", minimumSqm: 9}], packages: [], taxNote: "Excludes tax unless stated in the official quotation.", approvedBy: "", approvedAt: ""};

/** FR-159: tariff table for the public booth fee estimator (Super Admin; requires ENABLE_FEE_ESTIMATOR to show publicly). */
export default function EstimatorAdmin() {
  const [text, setText] = useState(""), [enabled, setEnabled] = useState(false), [reason, setReason] = useState(""), [msg, setMsg] = useState("");
  useEffect(() => { call("/api/admin/estimator").then(j => { setEnabled(j.enabled); setText(JSON.stringify(j.tariffs ?? EXAMPLE, null, 2)); }).catch(e => setMsg(e.message)); }, []);
  const save = async (clear: boolean) => { setMsg(""); try { await call("/api/admin/estimator", "PUT", {tariffs: clear ? null : JSON.parse(text), reason}); setMsg(clear ? "Tariffs removed; estimator hidden." : "Tariffs saved (audited)."); } catch (e) { setMsg((e as Error).message); } };
  return <main className="cms-page"><header><p className="eyebrow">SALES · FINANCE</p><h1>Booth fee estimator</h1>
    <p>Only enter tariffs the organizer has approved. Estimates are informational and never create a quotation, reservation or invoice. Public visibility: <strong>{enabled ? "ENABLED" : "disabled (ENABLE_FEE_ESTIMATOR)"}</strong>.</p></header>
    <label>Tariffs (JSON; amounts in whole IDR as strings)<textarea rows={18} value={text} onChange={e => setText(e.target.value)} spellCheck={false} /></label>
    <label>Reason / approval reference<input value={reason} onChange={e => setReason(e.target.value)} /></label>
    <div className="cms-row-actions"><button disabled={reason.length < 8} onClick={() => void save(false)}>Save tariffs</button><button className="ghost" disabled={reason.length < 8} onClick={() => void save(true)}>Remove tariffs</button></div>
    {msg && <p role="status" className="micro">{msg}</p>}
  </main>;
}
