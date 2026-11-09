"use client";
import {Suspense, useCallback, useEffect, useRef, useState} from "react";
import CmsStatus from "../components/CmsStatus";
import {FilterChips, Pager, SavedFilters, SkeletonRows, EmptyRow, SortHeader, parseSort, useColumns, useUrlFilters, downloadCsv, useSelection, BulkBar} from "../components/DataList";

type Row = {id: string; email: string | null; phone?: string | null; status: string; createdAt: string; profile: {fullName: string; organization: string | null} | null; _count: {enrollments: number; requests: number; invoices: number}};
type Detail = {id: string; email: string | null; phone: string | null; status: string; profile: {fullName: string; organization: string | null; jobTitle: string | null; country: string | null} | null;
  enrollments: {id: string; type: string; status: string; conference: string | null; passes: {id: string; status: string; entitlement: string}[]}[];
  requests: {id: string; status: string; requestedAreaSqm: string; assigned: string[]}[]; invoices: {id: string; number: string; status: string; totalMinor?: string; summary?: {state: string; outstandingMinor: string}}[]};
type Note = {id: string; body: string; author: string; createdAt: string};
const call = async (u: string, m = "GET", b?: unknown) => { const r = await fetch(u, {method: m, cache: "no-store", headers: b ? {"Content-Type": "application/json"} : undefined, body: b ? JSON.stringify(b) : undefined}); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || "Request failed"); return j; };
const KEYS = ["q", "status", "sort", "page", "id"] as const;
const STATUS = [["ACTIVE", "Active"], ["PENDING_VERIFICATION", "Pending verification"], ["SUSPENDED", "Suspended"], ["CLOSED", "Closed"]];
const COLS = [{key: "name", label: "Customer", required: true}, {key: "company", label: "Company"}, {key: "status", label: "Status"}, {key: "reg", label: "Registrations"},
  {key: "booth", label: "Booth requests"}, {key: "inv", label: "Invoices"}, {key: "created", label: "Created"}];
const day = (d: string) => new Date(d).toLocaleDateString("en-GB", {timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric"});

/** FR-120 customers registry + drill-down, FR-153 corrections, FR-148 internal notes. */
function Customers() {
  const {values: f, set, query} = useUrlFilters(KEYS);
  const sort = parseSort(f.sort, {key: "created", dir: "desc"}), page = Math.max(1, Number(f.page) || 1);
  const [q, setQ] = useState(f.q), [rows, setRows] = useState<Row[] | null>(null), [total, setTotal] = useState(0), [limit, setLimit] = useState(25), [err, setErr] = useState("");
  const [d, setD] = useState<Detail | null>(null), [notes, setNotes] = useState<Note[]>([]), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const [note, setNote] = useState(""), [fix, setFix] = useState({fullName: "", organization: "", reason: ""}), [dup, setDup] = useState({id: "", keepId: "", reason: ""}), [confirmDup, setConfirmDup] = useState(false);
  const {visible, menu} = useColumns("customers", COLS);
  const drawerRef = useRef<HTMLElement>(null);
  useEffect(() => { if (d) drawerRef.current?.focus(); }, [d?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = useSelection((rows || []).map(r => r.id));
  useEffect(() => { setQ(f.q); }, [f.q]);
  useEffect(() => {
    const ctl = new AbortController(); setErr(""); setRows(null);
    const p = new URLSearchParams({q: f.q, page: String(page), pageSize: "25", sort: sort.key + ":" + sort.dir, ...(f.status ? {status: f.status} : {})});
    fetch("/api/admin/customers?" + p, {cache: "no-store", signal: ctl.signal}).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || "Customers could not be loaded."); return j; })
      .then(j => { setRows(j.customers); setTotal(j.total); setLimit(j.limit); }).catch(e => { if (!ctl.signal.aborted) { setErr((e as Error).message); setRows([]); } });
    return () => ctl.abort();
  }, [f.q, f.status, page, sort.key, sort.dir]);
  const open = useCallback(async (id: string) => {
    setMsg(""); try { const x = await call("/api/admin/customers/" + id); setD(x); setFix({fullName: x.profile?.fullName || "", organization: x.profile?.organization || "", reason: ""}); setConfirmDup(false);
      setNotes((await call(`/api/admin/notes?resourceType=CustomerAccount&resourceId=${id}`)).notes); } catch (e) { setMsg((e as Error).message); }
  }, []);
  useEffect(() => { if (f.id && /^[0-9a-f-]{36}$/i.test(f.id)) void open(f.id); else setD(null); }, [f.id, open]);
  const act = async (fn: () => Promise<unknown>, ok: string) => { setMsg(""); setBusy(true); try { await fn(); setMsg(ok); if (d) await open(d.id); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } };
  const cols = 1 + COLS.filter(c => visible(c.key)).length;
  const chips = [...(f.q ? [{label: `Search: ${f.q}`, onRemove: () => set({q: ""})}] : []), ...(f.status ? [{label: "Status: " + (STATUS.find(s => s[0] === f.status)?.[1] || f.status), onRemove: () => set({status: ""})}] : [])];

  return <main className="cms-page"><header className="imdx-cms-heading"><div><h1>Customers</h1><p>One account may hold visitor, conference and exhibitor records. Notes are internal and never shown to customers.</p></div></header>
    <section className="cms-panel" style={{padding: 0}} aria-label="Customer accounts">
      <div className="cms-dl-toolbar">
        <form className="cms-dl-search" role="search" onSubmit={e => { e.preventDefault(); set({q: q.trim()}); }}><label className="sr-only" htmlFor="cust-q">Search name, email, company or id</label>
          <input id="cust-q" type="search" placeholder="Search name, email, company or id" value={q} onChange={e => setQ(e.target.value)}/></form>
        <label className="cms-dl-inline">Status<select value={f.status} onChange={e => set({status: e.target.value})}><option value="">All</option>{STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <SavedFilters listKey="customers" query={query} apply={qs => { const p = new URLSearchParams(qs); set({q: p.get("q") || "", status: p.get("status") || "", sort: p.get("sort") || ""}); }}/>
        {menu}
      </div>
      <FilterChips chips={chips}/>
      <BulkBar count={sel.sel.length} onClear={sel.clear}>
        <button type="button" className="ghost cms-small" onClick={() => downloadCsv("imdx-customers-selected.csv", ["Name", "Email", "Company", "Status", "Registrations", "Booth requests", "Invoices", "Created"],
          (rows || []).filter(r => sel.has(r.id)).map(r => [r.profile?.fullName, r.email, r.profile?.organization, r.status, r._count.enrollments, r._count.requests, r._count.invoices, day(r.createdAt)]))}>Export selected (CSV)</button>
      </BulkBar>
      {err && <p className="cms-dl-error" role="alert">{err}</p>}
      <div className="cms-table-wrap" style={{border: 0, borderRadius: 0}}><table className="cms-table"><thead><tr>
        <th scope="col" style={{width: 36}}><input type="checkbox" aria-label="Select all customers on this page" checked={sel.all} onChange={sel.toggleAll}/></th>
        {visible("name") && <SortHeader label="Customer" sortKey="name" sort={sort} onSort={s => set({sort: s.key + ":" + s.dir})}/>}
        {visible("company") && <th scope="col">Company</th>}
        {visible("status") && <SortHeader label="Status" sortKey="status" sort={sort} onSort={s => set({sort: s.key + ":" + s.dir})}/>}
        {visible("reg") && <th scope="col">Registrations</th>}{visible("booth") && <th scope="col">Booth requests</th>}{visible("inv") && <th scope="col">Invoices</th>}
        {visible("created") && <SortHeader label="Created" sortKey="created" sort={sort} onSort={s => set({sort: s.key + ":" + s.dir})}/>}
      </tr></thead><tbody aria-busy={!rows}>
        {!rows ? <SkeletonRows cols={cols}/> : !rows.length ? <EmptyRow cols={cols} title="No customers found." hint={chips.length ? " Remove a filter to see more accounts." : " Accounts appear here after customers sign up."}/>
        : rows.map(r => <tr key={r.id} className={"is-clickable" + (f.id === r.id ? " is-selected" : "")} onClick={e => { if (!(e.target as HTMLElement).closest("input,button,a")) set({id: r.id}, {resetPage: false}); }}>
          <td><input type="checkbox" aria-label={"Select " + (r.profile?.fullName || r.email)} checked={sel.has(r.id)} onChange={() => sel.toggle(r.id)}/></td>
          {visible("name") && <td><button type="button" className="link" onClick={() => set({id: r.id}, {resetPage: false})} aria-label={"Open " + (r.profile?.fullName || r.email || r.id)}>{r.profile?.fullName || r.email || r.id.slice(0, 8)}</button><span className="cms-sub">{r.email}</span></td>}
          {visible("company") && <td>{r.profile?.organization || "—"}</td>}
          {visible("status") && <td><CmsStatus domain="Account" value={r.status}/></td>}
          {visible("reg") && <td>{r._count.enrollments}</td>}{visible("booth") && <td>{r._count.requests}</td>}{visible("inv") && <td>{r._count.invoices}</td>}
          {visible("created") && <td className="cms-mono">{day(r.createdAt)}</td>}
        </tr>)}
      </tbody></table></div>
      <Pager page={page} pageSize={limit} total={total} onPage={p => set({page: String(p)}, {resetPage: false})} label="customers"/>
    </section>

    {msg && !d && <p role="status" className="notice">{msg}</p>}
    {d && <><button type="button" className="cms-drawer-backdrop" aria-label="Close customer detail" onClick={() => set({id: ""}, {resetPage: false})}/>
    <section className="cms-card cms-record cms-drawer" role="dialog" aria-modal="true" aria-labelledby="cust-h" ref={drawerRef} tabIndex={-1} onKeyDown={e => { if (e.key === "Escape") set({id: ""}, {resetPage: false}); }}>
      <div className="cms-record-head"><div><h2 id="cust-h">{d.profile?.fullName || d.email}</h2><p className="micro">{d.email} {d.phone ? "· " + d.phone : ""} · id <span className="cms-mono">{d.id.slice(0, 8)}</span></p></div>
        <CmsStatus domain="Account" value={d.status}/><button type="button" className="ghost cms-small" onClick={() => set({id: ""}, {resetPage: false})}>Close</button></div>
      <div className="cms-record-grid">
        <div>
          <h3>Registrations</h3>{d.enrollments.length ? <ul className="cms-plain-list">{d.enrollments.map(e => <li key={e.id}><strong>{e.type.toLowerCase()}{e.conference ? " · " + e.conference : ""}</strong> <CmsStatus domain="Registration" value={e.status}/>
            <span className="cms-sub">Passes: {e.passes.map(p => p.entitlement + " " + p.status.toLowerCase()).join(", ") || "none"} · <span className="cms-mono">{e.id.slice(0, 8)}</span></span></li>)}</ul> : <p className="micro">No registrations.</p>}
          <h3>Booth requests</h3>{d.requests.length ? <ul className="cms-plain-list">{d.requests.map(r => <li key={r.id}><a href={"/admin/booths?request=" + r.id}>{r.id.slice(0, 8)}</a> <CmsStatus domain="Booth request" value={r.status}/>
            <span className="cms-sub">Requested {r.requestedAreaSqm} m² · assigned {r.assigned.join(", ") || "—"}</span></li>)}</ul> : <p className="micro">No booth requests.</p>}
          <h3>Invoices</h3>{d.invoices.length ? <ul className="cms-plain-list">{d.invoices.map(i => <li key={i.id}><a href={"/admin/payments?invoice=" + encodeURIComponent(i.number)}>{i.number}</a> <CmsStatus domain="Invoice" value={i.summary?.state || i.status}/>
            {i.summary && <span className="cms-sub">Outstanding Rp {Number(i.summary.outstandingMinor).toLocaleString("id-ID")}</span>}</li>)}</ul> : <p className="micro">No invoices.</p>}
        </div>
        <div>
          <h3>Internal notes</h3>{notes.length ? <ul className="cms-plain-list">{notes.map(n => <li key={n.id}>{n.body}<span className="cms-sub">{n.author} · {new Date(n.createdAt).toLocaleString("en-GB", {timeZone: "Asia/Jakarta"})} WIB</span></li>)}</ul> : <p className="micro">No notes yet.</p>}
          <form className="cms-row-actions" onSubmit={e => { e.preventDefault(); void act(() => call("/api/admin/notes", "POST", {resourceType: "CustomerAccount", resourceId: d.id, body: note}).then(() => setNote("")), "Note added."); }}>
            <label>Add note<input required minLength={2} value={note} onChange={e => setNote(e.target.value)} /></label><button disabled={busy}>Add</button></form>
        </div>
      </div>
      <details className="cms-record-section"><summary>Correct profile</summary><p className="micro">Booking snapshots and QR tokens are not edited. A name change may require reissuing passes.</p>
        <form className="form-grid" onSubmit={e => { e.preventDefault(); void act(() => call("/api/admin/customers/" + d.id, "PATCH", {fullName: fix.fullName, organization: fix.organization || null, reason: fix.reason}), "Correction saved."); }}>
          <label>Full name<input value={fix.fullName} onChange={e => setFix({...fix, fullName: e.target.value})} /></label><label>Organization<input value={fix.organization} onChange={e => setFix({...fix, organization: e.target.value})} /></label>
          <label>Reason (required, min. 10 characters)<input required minLength={10} value={fix.reason} onChange={e => setFix({...fix, reason: e.target.value})} /></label><button disabled={busy}>Save correction</button></form></details>
      <details className="cms-record-section"><summary>Mark duplicate registration</summary><p className="micro">The duplicate is cancelled and its passes are revoked. This cannot be undone from the CMS.</p>
        <form className="form-grid" onSubmit={e => { e.preventDefault(); if (!confirmDup) { setConfirmDup(true); return; } void act(() => call(`/api/admin/registrations/${dup.id}/mark-duplicate`, "POST", {keepId: dup.keepId, reason: dup.reason}), "Duplicate cancelled; passes revoked."); }}>
          <label>Duplicate<select required value={dup.id} onChange={e => { setDup({...dup, id: e.target.value}); setConfirmDup(false); }}><option value="">Choose…</option>{d.enrollments.map(e => <option key={e.id} value={e.id} disabled={e.id === dup.keepId}>{e.type} {e.conference || ""} {e.status} {e.id.slice(0, 8)}</option>)}</select></label>
          <label>Keep<select required value={dup.keepId} onChange={e => { setDup({...dup, keepId: e.target.value}); setConfirmDup(false); }}><option value="">Choose…</option>{d.enrollments.map(e => <option key={e.id} value={e.id} disabled={e.id === dup.id}>{e.type} {e.conference || ""} {e.status} {e.id.slice(0, 8)}</option>)}</select></label>
          <label>Reason<input required minLength={10} value={dup.reason} onChange={e => setDup({...dup, reason: e.target.value})} /></label>
          {confirmDup ? <div className="cms-confirm" role="alert"><span>Cancel registration {dup.id.slice(0, 8)} and revoke its passes?</span><button disabled={busy}>Yes, cancel duplicate</button><button type="button" className="ghost" onClick={() => setConfirmDup(false)}>Keep it</button></div>
            : <button disabled={busy}>Cancel duplicate</button>}</form></details>
      {msg && <p role="status" className="notice">{msg}</p>}
    </section></>}
  </main>;
}
export default function CustomersPage() { return <Suspense fallback={<div className="imdx-cms-empty">Loading customers…</div>}><Customers/></Suspense>; }
