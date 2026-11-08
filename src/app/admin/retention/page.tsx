"use client";
import {useCallback, useEffect, useState} from "react";
type Data = {categories: Record<string, {min: number; label: string}>; policy: {rules: Record<string, number>; approvedBy: string; approvedAt: string} | null; preview: Record<string, number> | null; lastRun: string | null};
const call = async (u: string, m = "GET", b?: unknown) => { const r = await fetch(u, {method: m, cache: "no-store", headers: b ? {"Content-Type": "application/json"} : undefined, body: b ? JSON.stringify(b) : undefined}); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || j.issues?.map((i: {field: string; message: string}) => i.field + ": " + i.message).join("; ") || "Request failed"); return j; };

/** FR-150: data retention rules (Super Admin). Empty = keep everything. */
export default function Retention() {
  const [d, setD] = useState<Data | null>(null), [rules, setRules] = useState<Record<string, string>>({}), [by, setBy] = useState(""), [at, setAt] = useState(""), [reason, setReason] = useState(""), [msg, setMsg] = useState("");
  const load = useCallback(async () => { try { const j: Data = await call("/api/admin/retention"); setD(j); setRules(Object.fromEntries(Object.entries(j.policy?.rules || {}).map(([k, v]) => [k, String(v)]))); setBy(j.policy?.approvedBy || ""); setAt(j.policy?.approvedAt || ""); } catch (e) { setMsg((e as Error).message); } }, []);
  useEffect(() => { void load(); }, [load]);
  const save = async (clear: boolean) => { setMsg(""); try { const r = Object.fromEntries(Object.entries(rules).filter(([, v]) => v.trim()).map(([k, v]) => [k, Number(v)])); await call("/api/admin/retention", "PUT", {policy: clear ? null : {rules: r, approvedBy: by, approvedAt: at}, reason}); setMsg(clear ? "Policy removed — nothing will be purged." : "Policy saved (audited). The worker applies it at most once per day."); await load(); } catch (e) { setMsg((e as Error).message); } };
  const runNow = async () => { const typed = window.prompt("Type PURGE to delete/anonymise the records counted in the preview now."); if (typed !== "PURGE") return; try { const r = await call("/api/admin/retention", "POST", {confirm: "PURGE", reason}); setMsg("Purged: " + JSON.stringify(r.counts)); await load(); } catch (e) { setMsg((e as Error).message); } };
  if (!d) return <main className="cms-page"><p>{msg || "Loading…"}</p></main>;
  return <main className="cms-page"><header><p className="eyebrow">SUPER ADMIN · DATA GOVERNANCE</p><h1>Data retention</h1>
    <p>Enter retention periods approved under D-13/D-10. Empty fields keep data indefinitely. Audit log, invoices, payments, admissions, registrations and accounts are never purged here. Last scheduled run: {d.lastRun ? new Date(d.lastRun).toLocaleString("en-GB", {timeZone: "Asia/Jakarta"}) + " WIB" : "never"}.</p></header>
    <table className="cms-table"><thead><tr><th>Category</th><th>Keep (days)</th><th>Would purge now</th></tr></thead><tbody>
      {Object.entries(d.categories).map(([k, c]) => <tr key={k}><td><strong>{k}</strong><br /><span className="micro">{c.label}</span></td>
        <td><input type="number" min={c.min} max={3650} placeholder={"≥ " + c.min} value={rules[k] || ""} onChange={e => setRules({...rules, [k]: e.target.value})} aria-label={k + " days"} /></td>
        <td>{d.preview?.[k] ?? "—"}</td></tr>)}</tbody></table>
    <div className="form-grid"><label>Approved by<input value={by} onChange={e => setBy(e.target.value)} /></label><label>Approval date<input type="date" value={at} onChange={e => setAt(e.target.value)} /></label>
      <label>Reason<input value={reason} onChange={e => setReason(e.target.value)} /></label></div>
    <div className="cms-row-actions"><button disabled={reason.length < 8} onClick={() => void save(false)}>Save policy</button><button className="ghost" disabled={reason.length < 8} onClick={() => void save(true)}>Remove policy</button>
      <button className="ghost" disabled={!d.policy || reason.length < 8} onClick={() => void runNow()}>Run now</button></div>
    {msg && <p role="status" className="micro">{msg}</p>}
  </main>;
}
