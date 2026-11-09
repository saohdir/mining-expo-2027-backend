"use client";
import {useCallback, useEffect, useState} from "react";
type Mailout = {id: string; subject: string; segment: string; sendAt: string; status: string; recipients: number; createdBy: string; approvedBy: string | null};
const call = async (u: string, m = "GET", b?: unknown) => { const r = await fetch(u, {method: m, cache: "no-store", headers: b ? {"Content-Type": "application/json"} : undefined, body: b ? JSON.stringify(b) : undefined}); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || j.issues?.map((i: {message: string}) => i.message).join("; ") || "Request failed"); return j; };
const SEG: Record<string, string> = {ALL_CONFIRMED: "Everyone with a confirmed registration", VISITORS: "Confirmed visitors", CONFERENCE: "Confirmed conference delegates", PROGRAMME: "Delegates of one programme", EXHIBITORS: "Exhibitors and booth representatives", PREREGISTERED: "Pre-registered visitors who accepted"};
const wib = (s: string) => new Date(s).toLocaleString("en-GB", {timeZone: "Asia/Jakarta"}) + " WIB";

/** FR-154: scheduled service e-mails (draft → second-person approval → worker sends) and attendance reconciliation. */
export function MailoutsPanel() {
  const [list, setList] = useState<Mailout[] | null>(null), [msg, setMsg] = useState(""), [f, setF] = useState({subject: "", body: "", segment: "ALL_CONFIRMED", conferenceId: "", sendAt: ""});
  const [count, setCount] = useState<number | null>(null), [recon, setRecon] = useState<{counts: Record<string, number>} | null>(null), [csv, setCsv] = useState("");
  const load = useCallback(() => call("/api/admin/mailouts").then(j => setList(j.mailouts)).catch(e => setMsg(e.message)), []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (list === null) return; const q = new URLSearchParams({segment: f.segment, ...(f.conferenceId ? {conferenceId: f.conferenceId} : {})}); call("/api/admin/mailouts?" + q).then(j => setCount(j.recipients)).catch(() => setCount(null)); }, [f.segment, f.conferenceId, list]);
  const act = async (fn: () => Promise<unknown>, ok: string) => { setMsg(""); try { await fn(); setMsg(ok); await load(); } catch (e) { setMsg((e as Error).message); } };
  const reason = (what: string) => window.prompt("Reason to " + what + " (min 8 chars)") || "";
  return <>
    <section className="cms-card"><h2>Scheduled e-mails to participants</h2>
      <p className="micro">Service information only (schedules, venue, passes). A second staff member must approve each e-mail; recipients are taken from confirmed registrations at send time.</p>
      {msg && <p role="status" className="micro">{msg}</p>}
      {list && <form className="form-grid" onSubmit={e => { e.preventDefault(); void act(() => call("/api/admin/mailouts", "POST", {...f, conferenceId: f.conferenceId || null, sendAt: new Date(f.sendAt + ":00+07:00").toISOString()}), "Draft saved — ask a colleague to approve it."); }}>
        <label>Recipients<select value={f.segment} onChange={e => setF({...f, segment: e.target.value})}>{Object.entries(SEG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {f.segment === "PROGRAMME" && <label>Programme ID<input value={f.conferenceId} onChange={e => setF({...f, conferenceId: e.target.value})} /></label>}
        <label>Send at (WIB)<input type="datetime-local" required value={f.sendAt} onChange={e => setF({...f, sendAt: e.target.value})} /></label>
        <label>Subject<input required minLength={5} maxLength={150} value={f.subject} onChange={e => setF({...f, subject: e.target.value})} /></label>
        <label>Message (plain text)<textarea required minLength={20} maxLength={10000} rows={8} value={f.body} onChange={e => setF({...f, body: e.target.value})} /></label>
        <p className="micro">{count === null ? "" : count + " recipient(s) right now."}</p>
        <button>Save draft</button></form>}
      {list && list.length > 0 && <table className="cms-table"><thead><tr><th>Subject</th><th>Recipients</th><th>Send at</th><th>Status</th><th /></tr></thead><tbody>
        {list.map(m => <tr key={m.id}><td>{m.subject}<br /><span className="micro">{SEG[m.segment]}</span></td><td>{m.recipients}</td><td>{wib(m.sendAt)}</td><td>{m.status}</td>
          <td className="cms-row-actions">{m.status === "DRAFT" && <button className="cms-small" onClick={() => { const r = reason("approve"); if (r) void act(() => call(`/api/admin/mailouts/${m.id}/approve`, "POST", {reason: r}), "Approved and scheduled."); }}>Approve</button>}
            {["DRAFT", "SCHEDULED"].includes(m.status) && <button className="ghost cms-small" onClick={() => { const r = reason("cancel"); if (r) void act(() => call(`/api/admin/mailouts/${m.id}/cancel`, "POST", {reason: r}), "Cancelled."); }}>Cancel</button>}</td></tr>)}</tbody></table>}
    </section>
    <section className="cms-card"><h2>Attendance reconciliation</h2>
      <p className="micro">Compares admissions with the pre-registration list (default) or an uploaded CSV with an <code>email</code> column.</p>
      <label>Optional expected list (CSV)<input type="file" accept=".csv,text/csv" onChange={e => { const file = e.target.files?.[0]; if (file) void file.text().then(setCsv); }} /></label>
      <div className="cms-row-actions"><button onClick={() => void act(async () => setRecon(await call("/api/admin/reports/reconciliation", "POST", csv ? {csv} : {})), "Reconciliation ready.")}>Run</button>
        <button className="ghost" onClick={async () => { const r = await fetch("/api/admin/reports/reconciliation", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({format: "csv", ...(csv ? {csv} : {})})}); if (!r.ok) { setMsg("Download failed"); return; } const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob()); a.download = "imdx-reconciliation.csv"; a.click(); }}>Download CSV</button></div>
      {recon && <dl className="cms-stats">{Object.entries(recon.counts).map(([k, v]) => <div key={k}><dt>{k.replaceAll("_", " ").toLowerCase()}</dt><dd>{v}</dd></div>)}</dl>}
    </section></>;
}
