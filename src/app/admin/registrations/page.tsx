"use client";
import Link from "next/link";
import {Suspense, useEffect, useState} from "react";
import {useCmsSession, CmsIcon} from "../components/CmsShell";
import CmsStatus from "../components/CmsStatus";
import {OVERRIDES, useConfirm} from "../components/Confirm";
import {BulkBar, EmptyRow, FilterChips, Pager, SavedFilters, SkeletonRows, SortHeader, downloadCsv, parseSort, useColumns, useSelection, useUrlFilters} from "../components/DataList";

type RecordRow = {id: string; accountId: string; type: string; status: string; customerName: string; email: string | null; createdAt: string; conference: string | null; organization?: string | null};
type Payload = {total: number; page: number; limit: number; rows: RecordRow[]};
const types = ["VISITOR", "CONFERENCE", "EXHIBITOR"];
const statuses = ["DRAFT", "SUBMITTED", "PENDING_REVIEW", "CONFIRMED", "REJECTED", "CANCELLED"];
const nice = (v: string) => v.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, x => x.toUpperCase());
const when = (value: string) => new Date(value).toLocaleString("en-GB", {timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short"}) + " WIB";
const KEYS = ["q", "type", "status", "from", "to", "sort", "page"] as const;
const COLS = [{key: "ref", label: "Reference"}, {key: "customer", label: "Customer", required: true}, {key: "type", label: "Type"}, {key: "conference", label: "Conference"},
  {key: "status", label: "Registration"}, {key: "created", label: "Created (WIB)"}, {key: "review", label: "Review", required: true}];
const FINAL = ["CONFIRMED", "REJECTED", "CANCELLED"];

function Registrations() {
  const {actor} = useCmsSession();
  const ask = useConfirm();
  const {values: f, set, query} = useUrlFilters(KEYS);
  const type = types.includes(f.type) ? f.type : "", status = statuses.includes(f.status) ? f.status : "";
  const sort = parseSort(f.sort, {key: "created", dir: "desc"}), page = Math.max(1, Number(f.page) || 1);
  const [q, setQ] = useState(f.q);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [reviewing, setReviewing] = useState<RecordRow[] | null>(null);
  const [decision, setDecision] = useState<"CONFIRMED" | "REJECTED">("CONFIRMED");
  const [reviewReason, setReviewReason] = useState(""), [confirmStep, setConfirmStep] = useState(false);
  const [working, setWorking] = useState(false), [feedback, setFeedback] = useState("");
  const [reloadTick, setReloadTick] = useState(0);
  const {visible, menu} = useColumns("registrations", COLS);
  const canReview = actor?.role === "OPERATIONS" || actor?.role === "SUPER_ADMIN";
  const canAct = (row: RecordRow) => canReview && !FINAL.includes(row.status);
  const actionable = (data?.rows || []).filter(canAct);
  const sel = useSelection(actionable.map(r => r.id));
  useEffect(() => { setQ(f.q); }, [f.q]);
  useEffect(() => {
    const controller = new AbortController();
    const p = new URLSearchParams({page: String(page), limit: "30", sort: sort.key + ":" + sort.dir});
    if (f.q) p.set("q", f.q); if (type) p.set("type", type); if (status) p.set("status", status);
    if (f.from) p.set("from", f.from); if (f.to) p.set("to", f.to);
    setLoading(true); setError("");
    fetch("/api/admin/registrations?" + p.toString(), {cache: "no-store", signal: controller.signal})
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw Error(r.status === 403 ? "You don't have permission for this action" : d.message || "Cannot load registrations"); return d as Payload; })
      .then(d => { if (!controller.signal.aborted) setData(d); })
      .catch(e => { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : "Unable to load"); setData(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [f.q, type, status, f.from, f.to, page, sort.key, sort.dir, reloadTick]);

  const conferenceOnly = (rows: RecordRow[]) => rows.every(r => r.type === "CONFERENCE");
  const openReview = (rows: RecordRow[]) => { setReviewing(rows); setDecision(conferenceOnly(rows) || actor?.role === "SUPER_ADMIN" ? "CONFIRMED" : "REJECTED"); setReviewReason(""); setFeedback(""); setConfirmStep(false); };
  // Each record goes through the same per-record review endpoint (same policy checks and audit entry); results are reported per record.
  const review = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewing?.length) return;
    if (reviewing.length > 1 && !confirmStep) { setConfirmStep(true); return; }
    if (decision === "CONFIRMED" && !conferenceOnly(reviewing) && actor?.role !== "SUPER_ADMIN") { setFeedback("Visitor confirmation follows the visitor policy; exhibitors require booth allocation."); return; }
    setWorking(true); setFeedback("");
    const failed: string[] = []; let ok = 0; let reason = reviewReason.trim();
    const send = (row: RecordRow, override: boolean) => fetch("/api/admin/registrations/" + row.id + "/review", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({decision, reason, override})});
    // Super Admin: records refused by an overridable policy are listed in one warning and re-sent with override if confirmed.
    const blocked: {row: RecordRow; code: string; message: string}[] = [];
    for (const row of reviewing) {
      if (!canAct(row)) continue;
      try {
        const response = await send(row, false);
        const d = await response.json().catch(() => ({}));
        if (!response.ok) { if (actor?.role === "SUPER_ADMIN" && OVERRIDES[d.error]) { blocked.push({row, code: d.error, message: d.message}); continue; } throw new Error(d.message || "Review was not accepted."); }
        ok++;
      } catch (err) { failed.push(row.id.slice(0, 8) + ": " + (err instanceof Error ? err.message : "failed")); }
    }
    if (blocked.length) {
      const codes = [...new Set(blocked.map(b => b.code))];
      const go = await ask({title: blocked.length === 1 ? OVERRIDES[codes[0]].title : `Override the rules for ${blocked.length} registrations?`, tone: "danger", override: true, confirmLabel: "Yes, override and continue",
        intro: blocked.length > 1 ? blocked.map(b => `${b.row.customerName || b.row.id.slice(0, 8)}: ${b.message}`).join(" · ") : blocked[0].message,
        changes: [...new Set(codes.flatMap(c => OVERRIDES[c].changes || []))], impact: [...new Set(codes.flatMap(c => OVERRIDES[c].impact || []))], reason: {min: 8, initial: reason}});
      if (go) { reason = go.reason;
        for (const b of blocked) { const r = await send(b.row, true); const d = await r.json().catch(() => ({})); if (r.ok) ok++; else failed.push(b.row.id.slice(0, 8) + ": " + (d.message || "failed")); } }
      else blocked.forEach(b => failed.push(b.row.id.slice(0, 8) + ": " + b.message));
    }
    setWorking(false);
    setFeedback(reviewing.length === 1 && !failed.length ? "Registration " + decision.toLowerCase() + ". The action was added to the audit log."
      : `${ok} of ${reviewing.length} registrations ${decision.toLowerCase()}.` + (failed.length ? " Not changed: " + failed.join("; ") : " Each action was added to the audit log."));
    if (!failed.length) { setReviewing(null); setReviewReason(""); }
    sel.clear(); setReloadTick(n => n + 1);
  };
  const exportLink = (format: "xlsx" | "pdf") => {
    const p = new URLSearchParams({format}); if (type) p.set("type", type); if (status) p.set("status", status);
    if (f.q) p.set("q", f.q); if (f.from) p.set("from", f.from); if (f.to) p.set("to", f.to);
    return "/api/admin/reports/export?" + p.toString();
  };
  const onSort = (s: {key: string; dir: "asc" | "desc"}) => set({sort: s.key + ":" + s.dir});
  const chips = [
    ...(f.q ? [{label: "Search: " + f.q, onRemove: () => set({q: ""})}] : []), ...(type ? [{label: "Type: " + nice(type), onRemove: () => set({type: ""})}] : []),
    ...(status ? [{label: "Status: " + nice(status), onRemove: () => set({status: ""})}] : []), ...(f.from ? [{label: "From " + f.from, onRemove: () => set({from: ""})}] : []),
    ...(f.to ? [{label: "To " + f.to, onRemove: () => set({to: ""})}] : [])];
  const colCount = 1 + COLS.filter(c => visible(c.key)).length;
  const rows = data?.rows || [];
  return <>
    <header className="imdx-cms-heading"><div><h1>Registrations</h1>
      <p>Visitor, conference and exhibitor records. Every row is an enrollment, not a unique person.</p></div>
      {actor && ["SUPER_ADMIN", "OPERATIONS", "SALES", "FINANCE"].includes(actor.role) && <div className="cms-row-actions">
        <a className="ghost button-link cms-small" href={exportLink("xlsx")}>Export XLSX</a>
        <a className="ghost button-link cms-small" href={exportLink("pdf")}>Export PDF</a></div>}
    </header>
    {feedback && <p className="notice" role="status">{feedback}</p>}
    {reviewing && <section className="imdx-cms-panel" aria-label="Registration decision">
      <div className="imdx-cms-panel-title"><div><h2>{reviewing.length > 1 ? `Review ${reviewing.length} registrations` : "Review registration"}</h2>
        <p className="micro">{reviewing.length > 1 ? reviewing.map(r => r.customerName || r.email || r.id.slice(0, 8)).join(", ") : `${reviewing[0].customerName || reviewing[0].email || "Customer"} · ${reviewing[0].type} · ${reviewing[0].id}`}</p></div>
        <button type="button" className="ghost cms-small" onClick={() => setReviewing(null)}>Close</button>
      </div>
      <p className="micro">Conference confirmations require an approved free session or a fully Finance-verified paid invoice. Visitor and exhibitor confirmations follow their separate PRD workflows.</p>
      <form className="cms-review-form" onSubmit={e => void review(e)}>
        <label>Decision<select value={decision} onChange={e => { setDecision(e.target.value as "CONFIRMED" | "REJECTED"); setConfirmStep(false); }}>
          {(conferenceOnly(reviewing) || actor?.role === "SUPER_ADMIN") && <option value="CONFIRMED">{conferenceOnly(reviewing) ? "Confirm (policy-checked)" : "Confirm (Super Admin override)"}</option>}
          <option value="REJECTED">Reject</option>
        </select></label>
        <label>Audit reason<textarea required minLength={8} maxLength={500} value={reviewReason}
          onChange={e => { setReviewReason(e.target.value); setConfirmStep(false); }} placeholder="Explain the decision for the audit log"/></label>
        {confirmStep ? <div className="cms-confirm" role="alert"><span>{decision === "REJECTED" ? "Reject" : "Confirm"} {reviewing.length} registrations with this reason?</span>
          <button type="submit" disabled={working}>{working ? "Saving…" : "Yes, apply to " + reviewing.length}</button><button type="button" className="ghost" onClick={() => setConfirmStep(false)}>Go back</button></div>
          : <button type="submit" disabled={working || reviewReason.trim().length < 8}>{working ? "Saving…" : reviewing.length > 1 ? "Continue" : "Submit reviewed decision"}</button>}
      </form>
    </section>}
    <section className="imdx-cms-panel" style={{padding: 0}} aria-label="All registrations">
      <div className="cms-dl-toolbar">
        <form className="cms-dl-search" role="search" onSubmit={e => { e.preventDefault(); set({q: q.trim()}); }}>
          <label className="sr-only" htmlFor="reg-q">Search customer or reference</label>
          <input id="reg-q" type="search" value={q} placeholder="Search name, email or registration reference" onChange={e => setQ(e.target.value)}/></form>
        <label className="cms-dl-inline">Type<select value={type} onChange={e => set({type: e.target.value})}><option value="">All</option>{types.map(t => <option key={t} value={t}>{nice(t)}</option>)}</select></label>
        <label className="cms-dl-inline">Status<select value={status} onChange={e => set({status: e.target.value})}><option value="">All</option>{statuses.map(t => <option key={t} value={t}>{nice(t)}</option>)}</select></label>
        <label className="cms-dl-inline">From<input type="date" value={f.from} onChange={e => set({from: e.target.value})}/></label>
        <label className="cms-dl-inline">To<input type="date" min={f.from || undefined} value={f.to} onChange={e => set({to: e.target.value})}/></label>
        <SavedFilters listKey="registrations" query={query} apply={qs => { const p = new URLSearchParams(qs); set(Object.fromEntries(KEYS.filter(k => k !== "page").map(k => [k, p.get(k) || ""]))); }}/>
        {menu}
        <span className="imdx-cms-timezone"><CmsIcon name="clock" size={15}/> WIB (UTC+7)</span>
      </div>
      <FilterChips chips={chips}/>
      <BulkBar count={sel.sel.length} onClear={sel.clear}>
        {canReview && <button type="button" className="ghost cms-small" onClick={() => openReview(actionable.filter(r => sel.has(r.id)))}>Review selected…</button>}
        <button type="button" className="ghost cms-small" onClick={() => downloadCsv("imdx-registrations-selected.csv", ["Reference", "Customer", "Email", "Company", "Type", "Conference", "Status", "Created (WIB)"],
          rows.filter(r => sel.has(r.id)).map(r => [r.id, r.customerName, r.email, r.organization, r.type, r.conference, r.status, when(r.createdAt)]))}>Export selected (CSV)</button>
      </BulkBar>
      {error && <p className="cms-dl-error" role="alert">{error}</p>}
      <div className="imdx-cms-table-frame" style={{border: 0, borderRadius: 0}}>
        <table className="imdx-cms-table"><thead><tr>
          <th scope="col" style={{width: 36}}>{canReview && actionable.length > 0 && <input type="checkbox" aria-label="Select all reviewable registrations on this page" checked={sel.all} onChange={sel.toggleAll}/>}</th>
          {visible("ref") && <th scope="col">Reference</th>}
          {visible("customer") && <SortHeader label="Customer" sortKey="customer" sort={sort} onSort={onSort}/>}
          {visible("type") && <SortHeader label="Type" sortKey="type" sort={sort} onSort={onSort}/>}
          {visible("conference") && <th scope="col">Conference</th>}
          {visible("status") && <SortHeader label="Registration" sortKey="status" sort={sort} onSort={onSort}/>}
          {visible("created") && <SortHeader label="Created (WIB)" sortKey="created" sort={sort} onSort={onSort}/>}
          {visible("review") && <th scope="col">Review</th>}
        </tr></thead>
        <tbody aria-busy={loading}>{loading ? <SkeletonRows cols={colCount}/> : !rows.length ? <EmptyRow cols={colCount} title="No registration records for these filters." hint={chips.length ? " Remove a filter to widen the search." : ""}/>
          : rows.map(row => <tr key={row.id} className={sel.has(row.id) ? "is-selected" : ""}>
          <td>{canAct(row) && <input type="checkbox" aria-label={"Select " + (row.customerName || row.id.slice(0, 8))} checked={sel.has(row.id)} onChange={() => sel.toggle(row.id)}/>}</td>
          {visible("ref") && <td><code>{row.id.slice(0, 8)}</code></td>}
          {visible("customer") && <td><strong>{row.customerName || "Unnamed"}</strong><div className="micro">{row.organization || row.email || "—"}</div></td>}
          {visible("type") && <td>{nice(row.type)}</td>}
          {visible("conference") && <td>{row.conference || "—"}</td>}
          {visible("status") && <td><CmsStatus domain="Registration" value={row.status}/></td>}
          {visible("created") && <td>{when(row.createdAt)}</td>}
          {visible("review") && <td>{canAct(row) ? <button type="button" className="ghost cms-small" onClick={() => openReview([row])}>Review</button> :
            <span className="micro">{FINAL.includes(row.status) ? "Final state" : "Read only"}</span>}
            {row.type === "CONFERENCE" && ["SUPER_ADMIN", "FINANCE", "SALES"].includes(actor?.role || "") &&
              <Link href={"/admin/workspace?section=finance&kind=enrollmentId&bookingId=" + encodeURIComponent(row.id) + "&accountId=" + encodeURIComponent(row.accountId)}> Prepare invoice</Link>}</td>}
        </tr>)}</tbody></table>
        {!loading && rows.map(row => <div className="imdx-cms-record-mobile" key={"mobile-" + row.id}>
          <div className="imdx-cms-panel-title"><strong>{row.customerName || "Unnamed"}</strong><CmsStatus domain="Registration" value={row.status}/></div>
          <small>Ref {row.id.slice(0, 8)} · {nice(row.type)}</small>
          <small>{when(row.createdAt)}</small>
          {canAct(row) ? <button type="button" className="ghost cms-small" onClick={() => openReview([row])}>Review registration</button> : <span>Read-only registration</span>}
        </div>)}
      </div>
      {data && <Pager page={page} pageSize={data.limit} total={data.total} onPage={p => set({page: String(p)}, {resetPage: false})} label="enrollments"/>}
      <p className="micro" style={{padding: "0 14px 12px"}}>Exports are role-protected, audited, capped at 2,000 records and use the same created-date, type, status and search filters.</p>
    </section>
  </>;
}
export default function RegistrationsPage() { return <Suspense fallback={<div className="imdx-cms-empty">Loading registrations…</div>}><Registrations/></Suspense>; }
