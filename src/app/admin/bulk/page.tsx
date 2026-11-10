"use client";
import {useConfirm} from "../components/Confirm";
import {useCallback, useEffect, useState} from "react";
import {MailoutsPanel} from "./MailoutsPanel";
type Summary = {dryRun: boolean; rows: number; valid: number; toInvite: number; skipped: {line: number; email: string; reason: string}[]; errors: {line: number; message: string}[]; sent?: number; failed?: {line: number; email: string}[]};
type Inv = {id: string; email: string; fullName: string; status: string; createdAt: string};
const call = async (u: string, m = "GET", b?: unknown) => { const r = await fetch(u, {method: m, cache: "no-store", headers: b ? {"Content-Type": "application/json"} : undefined, body: b ? JSON.stringify(b) : undefined}); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || "Request failed"); return j; };

/** FR-154: CSV pre-registration (dry run → import) and badge printing. Requires ENABLE_BULK_TOOLS. */
export default function BulkTools() {
  const ask = useConfirm();
  const [csv, setCsv] = useState(""), [reason, setReason] = useState(""), [sum, setSum] = useState<Summary | null>(null), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const [list, setList] = useState<Inv[]>([]), [counts, setCounts] = useState<Record<string, number> | null>(null), [category, setCategory] = useState("");
  const load = useCallback(async () => {
    try { setList((await call("/api/admin/preregistrations")).invitations); setCounts((await call("/api/admin/badges")).byCategory); } catch (e) { setMsg((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const submit = async (dryRun: boolean, why = reason) => {
    setBusy(true); setMsg("");
    try { const r = await call("/api/admin/preregistrations", "POST", {csv, dryRun, reason: why}); setSum(r); if (!dryRun) { setMsg(r.sent + " invitation(s) sent" + (r.failed?.length ? ", " + r.failed.length + " failed" : "") + "."); await load(); } }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const revoke = async (i: Inv) => { const ok = await ask({title: `Revoke the invitation for ${i.email}?`, tone: "danger", confirmLabel: "Yes, revoke", changes: ["The invitation link stops working."], impact: ["The person can no longer accept it; send a new invitation if needed."], reason: {min: 8}}); if (!ok) return; try { await call("/api/admin/invitations/" + i.id + "/revoke", "POST", {reason: ok.reason}); await load(); } catch (e) { setMsg((e as Error).message); } };
  return <main className="cms-page"><header><p className="eyebrow">OPERATIONS</p><h1>Pre-registration & badges</h1>
    <p>Import a CSV of expected visitors. Each person receives an invitation and creates or signs in to their own account (accepting terms and privacy) before a pass is issued. Always run a dry run first.</p></header>
    {msg && <p role="status" className="micro">{msg}</p>}
    <section className="cms-card"><h2>CSV import</h2>
      <p className="micro">Columns: <code>email,full_name,organization,job_title</code> (first two required, max 500 rows).</p>
      <label>CSV file<input type="file" accept=".csv,text/csv" onChange={e => { const f = e.target.files?.[0]; if (f) void f.text().then(t => { setCsv(t); setSum(null); }); }} /></label>
      <label>Or paste CSV<textarea rows={6} value={csv} onChange={e => { setCsv(e.target.value); setSum(null); }} /></label>
      <label>Reason (audit)<input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Delegation list from Ministry partner" /></label>
      <div className="cms-row-actions"><button disabled={busy || !csv} onClick={async () => { if (reason.trim().length >= 8) return void submit(true); const ok = await ask({title: "Check this CSV (dry run)?", tone: "info", confirmLabel: "Run check", changes: ["Nothing is imported or sent; you see how many rows would be invited."], reason: {min: 8, initial: reason}}); if (ok) { setReason(ok.reason); void submit(true, ok.reason); } }}>Dry run</button>
        <button disabled={busy || !sum?.dryRun || sum.errors.length > 0 || sum.toInvite === 0} onClick={async () => { const ok = await ask({title: `Send ${sum!.toInvite} invitation e-mail(s)?`, tone: "warning", confirmLabel: "Yes, import and send", changes: [`${sum!.toInvite} people are pre-registered and receive an invitation e-mail now.`], impact: ["Sent e-mails cannot be recalled; invitations can be revoked one by one."], reason: {min: 8, initial: reason}}); if (ok) void submit(false, ok.reason); }}>Import & send {sum?.dryRun ? sum.toInvite : ""} invitations</button></div>
      {sum && <div role="status"><p><strong>{sum.valid}</strong> valid of {sum.rows} · <strong>{sum.toInvite}</strong> to invite · {sum.skipped.length} skipped · {sum.errors.length} errors</p>
        {sum.errors.length > 0 && <ul>{sum.errors.map(e => <li key={"e" + e.line}>Line {e.line}: {e.message}</li>)}</ul>}
        {sum.skipped.length > 0 && <details><summary>Skipped</summary><ul>{sum.skipped.map(s => <li key={"s" + s.line}>Line {s.line}: {s.email} — {s.reason}</li>)}</ul></details>}</div>}
    </section>
    <section className="cms-card"><h2>Badge printing</h2>
      <p className="micro">A6 name badges for people holding an active pass. Badges show identity only; entry always uses the person&apos;s own QR pass.</p>
      {counts && <p>{Object.entries(counts).map(([k, v]) => k + ": " + v).join(" · ")}</p>}
      <label>Category<select value={category} onChange={e => setCategory(e.target.value)}><option value="">All</option>{["VISITOR", "DELEGATE", "EXHIBITOR"].map(c => <option key={c}>{c}</option>)}</select></label>
      <a className="button-link" href={"/api/admin/badges?format=pdf" + (category ? "&category=" + category : "")}>Download badge PDF</a>
    </section>
    <MailoutsPanel />
    <section><h2>Pre-registration invitations</h2>
      <table className="cms-table"><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Invited (WIB)</th><th /></tr></thead><tbody>
        {list.map(i => <tr key={i.id}><td>{i.fullName}</td><td>{i.email}</td><td>{i.status}</td><td>{new Date(i.createdAt).toLocaleString("en-GB", {timeZone: "Asia/Jakarta"})}</td>
          <td>{["INVITED", "ACCEPTED"].includes(i.status) && <button className="ghost cms-small" onClick={() => void revoke(i)}>Revoke</button>}</td></tr>)}</tbody></table></section>
  </main>;
}
