"use client";
import {useCallback, useEffect, useState} from "react";
type Lead = {id: string; leadType: string; name: string; email: string; company: string | null; phone: string | null; message: string; status: string; utmSource: string | null; utmCampaign: string | null; createdAt: string};
const call = async (u: string, m = "GET", b?: unknown) => { const r = await fetch(u, {method: m, cache: "no-store", headers: b ? {"Content-Type": "application/json"} : undefined, body: b ? JSON.stringify(b) : undefined}); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || "Request failed"); return j; };
/** FR-036 lead inbox: website contact/partnership enquiries with status workflow and audit. */
export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]), [status, setStatus] = useState(""), [msg, setMsg] = useState("");
  const load = useCallback(async () => { try { setLeads((await call("/api/admin/leads" + (status ? "?status=" + status : ""))).leads); } catch (e) { setMsg((e as Error).message); } }, [status]);
  useEffect(() => { void load(); }, [load]);
  const move = async (l: Lead, next: string) => { const reason = window.prompt("Reason / note for " + next); if (!reason) return; try { await call("/api/admin/leads/" + l.id, "PATCH", {status: next, reason}); await load(); } catch (e) { setMsg((e as Error).message); } };
  return <main className="cms-page"><header><p className="eyebrow">SALES</p><h1>Lead inbox</h1><p>Enquiries from the public contact and partnership forms. Consent is recorded with each lead.</p></header>
    <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All</option>{["NEW", "CONTACTED", "QUALIFIED", "CLOSED"].map(s => <option key={s}>{s}</option>)}</select></label>
    {msg && <p role="status" className="micro">{msg}</p>}
    <table className="cms-table"><thead><tr><th>Received (WIB)</th><th>Type</th><th>Contact</th><th>Message</th><th>Source</th><th>Status</th></tr></thead><tbody>
      {leads.map(l => <tr key={l.id}><td>{new Date(l.createdAt).toLocaleString("en-GB", {timeZone: "Asia/Jakarta"})}</td><td>{l.leadType}</td>
        <td>{l.name}<br /><a href={"mailto:" + l.email}>{l.email}</a>{l.company ? <><br />{l.company}</> : null}</td><td style={{maxWidth: 360}}>{l.message}</td>
        <td className="micro">{[l.utmSource, l.utmCampaign].filter(Boolean).join(" / ") || "—"}</td>
        <td><strong>{l.status}</strong><div className="cms-row-actions">{["CONTACTED", "QUALIFIED", "CLOSED"].filter(s => s !== l.status).map(s => <button key={s} className="ghost cms-small" onClick={() => void move(l, s)}>{s}</button>)}</div></td></tr>)}
    </tbody></table></main>;
}
