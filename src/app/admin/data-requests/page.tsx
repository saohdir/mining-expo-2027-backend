"use client";
import {useCallback, useEffect, useState} from "react";
type Req = {id: string; accountId: string; kind: string; details: string; status: string; createdAt: string};
/** FR-150 personal-data request queue (Super Admin). */
export default function DataRequests() {
  const [rows, setRows] = useState<Req[]>([]), [msg, setMsg] = useState("");
  const load = useCallback(async () => { const r = await fetch("/api/admin/data-requests", {cache: "no-store"}); const j = await r.json(); if (r.ok) setRows(j.requests); else setMsg(j.message); }, []);
  useEffect(() => { void load(); }, [load]);
  const move = async (r: Req, status: string) => { const reason = window.prompt("Reason / action taken"); if (!reason) return;
    const res = await fetch("/api/admin/data-requests/" + r.id, {method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify({status, reason})}); if (!res.ok) setMsg((await res.json()).message); await load(); };
  return <main className="cms-page"><header><p className="eyebrow">PRIVACY</p><h1>Personal-data requests</h1><p>Handle under the approved retention policy (D-13). Nothing is deleted automatically.</p></header>
    {msg && <p role="status">{msg}</p>}
    <table className="cms-table"><thead><tr><th>Received</th><th>Kind</th><th>Details</th><th>Customer</th><th>Status</th></tr></thead><tbody>
      {rows.map(r => <tr key={r.id}><td>{new Date(r.createdAt).toLocaleString("en-GB", {timeZone: "Asia/Jakarta"})}</td><td>{r.kind}</td><td style={{maxWidth: 360}}>{r.details}</td>
        <td><a href={"/admin/customers?q=" + r.accountId.slice(0, 8)}>{r.accountId.slice(0, 8)}</a></td>
        <td>{r.status}{!["COMPLETED", "REJECTED"].includes(r.status) && <div className="cms-row-actions">{["IN_PROGRESS", "COMPLETED", "REJECTED"].filter(s => s !== r.status).map(s => <button key={s} className="ghost cms-small" onClick={() => void move(r, s)}>{s}</button>)}</div>}</td></tr>)}
    </tbody></table></main>;
}
