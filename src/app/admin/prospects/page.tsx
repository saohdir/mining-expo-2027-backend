"use client";
import {useCallback, useEffect, useState} from "react";

type Row = {id: string; salutation: string; name: string; jobTitle: string; company: string; email: string; whatsapp: string; country: string; roles: string[]; programmes: string[];
  exhibitorProducts: string; boothLocation: string; attended: boolean; firstCheckIn: string | null; registeredAt: string};
type Bar = {label: string; count: number};
type Interest = {title: string; startsAtWib: string; zone: string | null; feeMinor: number | null; capacity: number | null; active: number; confirmed: number; pending: number;
  seatsRemaining: number | null; fillRate: number | null; paidInFull: number | null; checkedIn: number; attendanceRate: number | null};
type Data = {event: string; total: number; page: number; pageSize: number; rows: Row[]; conferences: {id: string; title: string}[]; interest?: Interest[];
  summary: {people: number; attended: number; withWhatsapp: number; byRole: Bar[]; topCompanies: Bar[]; topJobTitles: Bar[]; topCountries: Bar[]}};
const ROLES = [["", "Everyone"], ["VISITOR", "Exhibition visitors"], ["CONFERENCE", "Conference delegates"], ["EXHIBITOR", "Exhibitors"]] as const;
const pct = (n: number, d: number) => d ? Math.round(n * 100 / d) + "%" : "–";
const wib = (s: string) => new Date(s).toLocaleDateString("en-GB", {timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric"});

/** Ranked horizontal bars (one series, direct value labels, hover title). The table below is the full data view. */
function Bars({title, data}: {title: string; data: Bar[]}) {
  const max = Math.max(1, ...data.map(d => d.count));
  return <section className="prospects-chart" aria-label={title}><h3>{title}</h3>
    {data.length ? data.map(d => <div className="hbar" key={d.label} title={`${d.label}: ${d.count}`}><span>{d.label}</span><i aria-hidden="true"><b style={{width: Math.max(4, d.count / max * 100) + "%"}} /></i><em>{d.count}</em></div>)
      : <p className="micro">No data for this filter.</p>}
  </section>;
}

/** Participant prospects for next year's edition: visitors, conference delegates and exhibitors as people. */
export default function Prospects() {
  const [f, setF] = useState({type: "", conferenceId: "", attended: "", q: ""}), [page, setPage] = useState(1);
  const [d, setD] = useState<Data | null>(null), [msg, setMsg] = useState(""), [loading, setLoading] = useState(true);
  const qs = useCallback((extra: Record<string, string> = {}) => new URLSearchParams(Object.fromEntries(Object.entries({...f, page: String(page), ...extra}).filter(([, v]) => v))).toString(), [f, page]);
  useEffect(() => { setLoading(true); const t = setTimeout(() => fetch("/api/admin/reports/prospects?" + qs(), {cache: "no-store"}).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.message); setD(j); setMsg(""); })
    .catch(e => setMsg(e.message)).finally(() => setLoading(false)), 250); return () => clearTimeout(t); }, [qs]);
  const set = (k: keyof typeof f, v: string) => { setF(x => ({...x, [k]: v})); setPage(1); };
  const s = d?.summary, pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  return <main className="cms-page prospects">
    <header><p className="eyebrow">INSIGHTS · NEXT EDITION</p><h1>Participant prospects</h1>
      <p>Everyone who registered this year as exhibition visitor, conference delegate or exhibitor — one row per person — to plan follow-up for the next edition.</p></header>
    {s && <dl className="prospects-kpis">
      <div><dt>People</dt><dd>{s.people}</dd></div>
      <div><dt>Attended (checked in)</dt><dd>{s.attended}<small>{pct(s.attended, s.people)}</small></dd></div>
      <div><dt>Verified WhatsApp</dt><dd>{s.withWhatsapp}<small>{pct(s.withWhatsapp, s.people)}</small></dd></div>
    </dl>}
    {s && <div className="prospects-charts">
      <Bars title="Participated as" data={s.byRole} /><Bars title="Top companies" data={s.topCompanies} /><Bars title="Top job titles" data={s.topJobTitles} />
    </div>}
    <div className="prospects-filters" role="search">
      <div className="seg" role="group" aria-label="Participant type">{ROLES.map(([v, l]) => <button key={v} type="button" aria-pressed={f.type === v} onClick={() => set("type", v)}>{l}</button>)}</div>
      {f.type === "CONFERENCE" && d && <label>Programme<select value={f.conferenceId} onChange={e => set("conferenceId", e.target.value)}><option value="">All programmes</option>{d.conferences.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>}
      <label>Attendance<select value={f.attended} onChange={e => set("attended", e.target.value)}><option value="">Any</option><option value="yes">Checked in</option><option value="no">Registered, did not attend</option></select></label>
      <label>Search<input type="search" placeholder="Name, company, job, email" value={f.q} onChange={e => set("q", e.target.value)} /></label>
      <a className="button-link" href={"/api/admin/reports/prospects?" + qs({format: "xlsx", page: ""})}>Export Excel</a>
    </div>
    {f.type === "CONFERENCE" && d?.interest && <section className="cms-panel prospects-interest">
      <div className="imdx-cms-panel-title"><h2>Interest per conference</h2>
        <a className="button-link" href="/api/admin/reports/export?dataset=conferences&basis=created&format=xlsx">Export interest report (Excel)</a></div>
      <p className="micro">Registrations show the interest before the event; check-ins at each room&apos;s gate show the real attendance. The Excel file adds the delegate list as a second sheet.</p>
      <div className="cms-table-wrap"><table className="cms-table prospects-table"><thead><tr><th>Conference</th><th>Fee</th><th>Registrations / capacity</th><th>Fill rate</th><th>Confirmed</th><th>Pending</th><th>Paid in full</th><th>Checked in</th><th>Attendance</th></tr></thead><tbody>
        {d.interest.map(c => <tr key={c.title}>
          <td data-label="Conference"><strong>{c.title}</strong><small>{c.startsAtWib}{c.zone ? " · " + c.zone : ""}</small></td>
          <td data-label="Fee">{c.feeMinor === null ? "TBA" : c.feeMinor === 0 ? "Free" : "Rp " + c.feeMinor.toLocaleString("id-ID")}</td>
          <td data-label="Registrations / capacity">{c.active} / {c.capacity ?? "TBA"}{c.seatsRemaining !== null && <small>{c.seatsRemaining} seats left</small>}</td>
          <td data-label="Fill rate">{c.fillRate === null ? "—" : c.fillRate + "%"}</td>
          <td data-label="Confirmed">{c.confirmed}</td><td data-label="Pending">{c.pending}</td>
          <td data-label="Paid in full">{c.paidInFull ?? "—"}</td><td data-label="Checked in">{c.checkedIn}</td>
          <td data-label="Attendance">{c.attendanceRate === null ? "—" : c.attendanceRate + "%"}</td></tr>)}
      </tbody></table></div>
    </section>}
    {msg && <p role="alert" className="micro">{msg}</p>}
    {d && <section className="cms-panel"><div className="imdx-cms-panel-title"><h2>{d.total} {d.total === 1 ? "person" : "people"}</h2><span className="micro">{loading ? "Updating…" : "All registered participants"}</span></div>
      <div className="cms-table-wrap"><table className="cms-table prospects-table"><thead><tr><th>Person</th><th>Company</th><th>Contact</th><th>Participated as</th><th>Attended</th><th>Registered</th></tr></thead><tbody>
        {d.rows.map(r => <tr key={r.id}>
          <td data-label="Person"><strong>{[r.salutation, r.name].filter(Boolean).join(" ")}</strong><small>{r.jobTitle || "—"}</small></td>
          <td data-label="Company">{r.company || "—"}<small>{r.country}</small></td>
          <td data-label="Contact"><a href={"mailto:" + r.email}>{r.email}</a>{r.whatsapp && <small><a href={"https://wa.me/" + r.whatsapp.replace(/\D/g, "")} target="_blank" rel="noopener noreferrer">WhatsApp {r.whatsapp}</a></small>}</td>
          <td data-label="Participated as">{r.roles.map(x => <span key={x} className={"tag" + (x === "Exhibitor" ? " brand" : x === "Conference" ? " info" : "")}>{x}</span>)}
            {r.programmes.length > 0 && <small>{r.programmes.join("; ")}</small>}{r.exhibitorProducts && <small>{r.boothLocation ? r.boothLocation.toLowerCase() + " · " : ""}{r.exhibitorProducts}</small>}</td>
          <td data-label="Attended">{r.attended ? <span className="tag ok">Checked in</span> : <span className="tag">No</span>}</td>
          <td data-label="Registered">{wib(r.registeredAt)}</td></tr>)}
        {!d.rows.length && <tr><td colSpan={6}>No participants match these filters.</td></tr>}
      </tbody></table></div>
      {pages > 1 && <div className="cms-row-actions"><button className="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><span className="micro">Page {page} of {pages}</span><button className="ghost" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button></div>}
    </section>}
  </main>;
}
