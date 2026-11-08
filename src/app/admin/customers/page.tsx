"use client";
import {useCallback, useEffect, useState} from "react";

type Row = {id: string; email: string | null; status: string; createdAt: string; profile: {fullName: string; organization: string | null} | null; _count: {enrollments: number; requests: number; invoices: number}};
type Detail = {id: string; email: string | null; phone: string | null; status: string; profile: {fullName: string; organization: string | null; jobTitle: string | null; country: string | null} | null;
  enrollments: {id: string; type: string; status: string; conference: string | null; passes: {id: string; status: string; entitlement: string}[]}[];
  requests: {id: string; status: string; requestedAreaSqm: string; assigned: string[]}[]; invoices: {id: string; number: string; status: string; totalMinor?: string; summary?: {state: string; outstandingMinor: string}}[]};
type Note = {id: string; body: string; author: string; createdAt: string};
const call = async (u: string, m = "GET", b?: unknown) => { const r = await fetch(u, {method: m, cache: "no-store", headers: b ? {"Content-Type": "application/json"} : undefined, body: b ? JSON.stringify(b) : undefined}); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || "Request failed"); return j; };

/** FR-120 customers registry + drill-down, FR-153 corrections, FR-148 internal notes. */
export default function Customers() {
  const [q, setQ] = useState(""), [rows, setRows] = useState<Row[]>([]), [d, setD] = useState<Detail | null>(null), [notes, setNotes] = useState<Note[]>([]), [msg, setMsg] = useState("");
  const [note, setNote] = useState(""), [fix, setFix] = useState({fullName: "", organization: "", reason: ""}), [dup, setDup] = useState({id: "", keepId: "", reason: ""});
  const search = useCallback(async (term: string) => { try { setRows((await call("/api/admin/customers?q=" + encodeURIComponent(term))).customers); } catch (e) { setMsg((e as Error).message); } }, []);
  const open = async (id: string) => { setMsg(""); const x = await call("/api/admin/customers/" + id); setD(x); setFix({fullName: x.profile?.fullName || "", organization: x.profile?.organization || "", reason: ""});
    setNotes((await call(`/api/admin/notes?resourceType=CustomerAccount&resourceId=${id}`)).notes); };
  useEffect(() => { void search(""); }, [search]);
  const act = async (fn: () => Promise<unknown>, ok: string) => { setMsg(""); try { await fn(); setMsg(ok); if (d) await open(d.id); } catch (e) { setMsg((e as Error).message); } };
  return <main className="cms-page"><header><p className="eyebrow">CUSTOMERS</p><h1>Customer accounts</h1><p>One account may hold visitor, conference and exhibitor records. Notes are internal and never shown to customers.</p></header>
    <form className="cms-row-actions" onSubmit={e => { e.preventDefault(); void search(q); }}><label>Search name, email, company or id<input value={q} onChange={e => setQ(e.target.value)} /></label><button>Search</button></form>
    {msg && <p role="status" className="micro">{msg}</p>}
    <div className="cms-columns" style={{gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)"}}>
      <ul className="cms-list">{rows.map(r => <li key={r.id}><button type="button" className="link" onClick={() => void open(r.id)}>{r.profile?.fullName || r.email} · {r.profile?.organization || "—"}</button>
        <span className="micro"> {r.status} · {r._count.enrollments} reg · {r._count.requests} booth · {r._count.invoices} inv</span></li>)}</ul>
      {d && <section className="cms-card" aria-label="Customer detail"><h2>{d.profile?.fullName}</h2><p className="micro">{d.email} {d.phone ? "· " + d.phone : ""} · {d.status} · id {d.id.slice(0, 8)}</p>
        <h3>Registrations</h3><ul className="micro">{d.enrollments.map(e => <li key={e.id}>{e.type} {e.conference ? "· " + e.conference : ""} · {e.status} · passes: {e.passes.map(p => p.entitlement + " " + p.status).join(", ") || "none"} <code>{e.id.slice(0, 8)}</code></li>)}</ul>
        <h3>Booth requests</h3><ul className="micro">{d.requests.map(r => <li key={r.id}><a href={"/admin/booths?request=" + r.id}>{r.id.slice(0, 8)}</a> · {r.status} · requested {r.requestedAreaSqm} m² · assigned {r.assigned.join(", ") || "—"}</li>)}</ul>
        <h3>Invoices</h3><ul className="micro">{d.invoices.map(i => <li key={i.id}><a href={"/admin/payments?invoice=" + encodeURIComponent(i.number)}>{i.number}</a> · {i.status}{i.summary ? " · " + i.summary.state + " · outstanding " + i.summary.outstandingMinor : ""}</li>)}</ul>
        <h3>Correct profile (FR-153)</h3><p className="micro">Booking snapshots and QR tokens are not edited. A name change may require reissuing passes.</p>
        <form className="form-grid" onSubmit={e => { e.preventDefault(); void act(() => call("/api/admin/customers/" + d.id, "PATCH", {fullName: fix.fullName, organization: fix.organization || null, reason: fix.reason}), "Correction saved."); }}>
          <label>Full name<input value={fix.fullName} onChange={e => setFix({...fix, fullName: e.target.value})} /></label><label>Organization<input value={fix.organization} onChange={e => setFix({...fix, organization: e.target.value})} /></label>
          <label>Reason (required)<input required minLength={10} value={fix.reason} onChange={e => setFix({...fix, reason: e.target.value})} /></label><button>Save correction</button></form>
        <h3>Mark duplicate registration</h3>
        <form className="form-grid" onSubmit={e => { e.preventDefault(); void act(() => call(`/api/admin/registrations/${dup.id}/mark-duplicate`, "POST", {keepId: dup.keepId, reason: dup.reason}), "Duplicate cancelled; passes revoked."); }}>
          <label>Duplicate<select required value={dup.id} onChange={e => setDup({...dup, id: e.target.value})}><option value="">Choose…</option>{d.enrollments.map(e => <option key={e.id} value={e.id}>{e.type} {e.conference || ""} {e.status} {e.id.slice(0, 8)}</option>)}</select></label>
          <label>Keep<select required value={dup.keepId} onChange={e => setDup({...dup, keepId: e.target.value})}><option value="">Choose…</option>{d.enrollments.map(e => <option key={e.id} value={e.id}>{e.type} {e.conference || ""} {e.status} {e.id.slice(0, 8)}</option>)}</select></label>
          <label>Reason<input required minLength={10} value={dup.reason} onChange={e => setDup({...dup, reason: e.target.value})} /></label><button>Cancel duplicate</button></form>
        <h3>Internal notes</h3><ul className="micro">{notes.map(n => <li key={n.id}>{new Date(n.createdAt).toLocaleString("en-GB", {timeZone: "Asia/Jakarta"})} · {n.author}: {n.body}</li>)}</ul>
        <form className="cms-row-actions" onSubmit={e => { e.preventDefault(); void act(() => call("/api/admin/notes", "POST", {resourceType: "CustomerAccount", resourceId: d.id, body: note}).then(() => setNote("")), "Note added."); }}>
          <label>Add note<input required minLength={2} value={note} onChange={e => setNote(e.target.value)} /></label><button>Add</button></form>
      </section>}
    </div></main>;
}
