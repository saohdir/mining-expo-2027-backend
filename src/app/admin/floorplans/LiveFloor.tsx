"use client";
import {useConfirm, type ConfirmOptions} from "../components/Confirm";
import {useCallback, useEffect, useMemo, useState} from "react";

type Occupant = {source: "BOOKING" | "HOLD" | "MANUAL"; company: string; contact: string; requestId: string | null; requestStatus: string | null};
type Row = {unitId: string; code: string; hall: string | null; areaSqm: number; status: string; splitFromId: string | null; occupant: Occupant | null; interested: {company: string; requestId: string; status: string}[]};
type Summary = {booths: number; booked: number; available: number; bookedArea: number; availableArea: number};
type Geo = {id?: string; code: string; x: number; y: number; w: number; h: number; rotation?: number};
type Plan = {id: string; title: string; active?: boolean; canvasWidth: number; canvasHeight: number; backgroundUrl?: string | null; units: Geo[]};

const api = async (path: string, method = "GET", body?: unknown) => {
  const r = await fetch(path, {method, cache: "no-store", headers: body ? {"Content-Type": "application/json"} : undefined, body: body ? JSON.stringify(body) : undefined});
  const d = await r.json().catch(() => ({})); if (!r.ok) throw Error(d.message || "Request failed"); return d;
};
const SOURCE: Record<Occupant["source"], string> = {BOOKING: "Confirmed via portal", HOLD: "Reserved via portal", MANUAL: "Entered by organizer"};
const tone = (r: Row) => r.occupant ? (r.status === "OCCUPIED" || r.occupant.source === "BOOKING" ? "booked" : "reserved") : r.status === "AVAILABLE" ? "free" : "blocked";
const FILL: Record<string, string> = {booked: "#C2410C", reserved: "#F79009", free: "#ECFDF3", blocked: "#D0D5DD"};
const short = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + "…" : s;

/** Live floor (published): Active / Inactive for customers, who booked which booth, manual "booked by", split and merge. */
export function LiveFloor({plan, canEdit, canBook, onChanged}: {plan: Plan; canEdit: boolean; canBook: boolean; onChanged: (msg: string) => void}) {
  const [rows, setRows] = useState<Row[]>([]), [summary, setSummary] = useState<Summary | null>(null), [sel, setSel] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(""), [company, setCompany] = useState(""), [contact, setContact] = useState(""), [st, setSt] = useState<"OCCUPIED" | "RESERVED">("OCCUPIED"), [keep, setKeep] = useState("");
  const [q, setQ] = useState(""), [only, setOnly] = useState<"" | "booked" | "free">("");
  const load = useCallback(() => api("/api/admin/floorplans/" + plan.id + "/occupancy").then(d => { setRows(d.units); setSummary(d.summary); }).catch(e => setMsg((e as Error).message)), [plan.id]);
  useEffect(() => { void load(); setSel(""); }, [load]);
  const byId = useMemo(() => new Map(rows.map(r => [r.unitId, r])), [rows]);
  const cur = byId.get(sel);
  useEffect(() => { setCompany(cur?.occupant?.source === "MANUAL" ? cur.occupant.company : ""); setContact(cur?.occupant?.source === "MANUAL" ? cur.occupant.contact : ""); setKeep(""); setMsg(""); }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const ask = useConfirm();
  // Every change: confirmation modal (what changes, impact) with the audit reason pre-filled from the reason field.
  const run = async (o: ConfirmOptions, fn: (why: string) => Promise<string>) => {
    const ok = await ask({...o, reason: {min: 8, initial: reason.trim()}}); if (!ok) return;
    setBusy(true); setMsg(""); try { const m = await fn(ok.reason); setReason(""); await load(); onChanged(m); setMsg(m); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } };
  const list = rows.filter(r => (!q || (r.code + " " + (r.occupant?.company || "") + " " + r.interested.map(i => i.company).join(" ")).toLowerCase().includes(q.toLowerCase()))
    && (!only || (only === "booked" ? !!r.occupant : r.status === "AVAILABLE" && !r.occupant)));
  // Without a background image, zoom to the booths so small layouts stay readable.
  const viewBox = useMemo(() => {
    if (plan.backgroundUrl || !plan.units.length) return "0 0 " + plan.canvasWidth + " " + plan.canvasHeight;
    const x0 = Math.min(...plan.units.map(u => u.x)), y0 = Math.min(...plan.units.map(u => u.y));
    const x1 = Math.max(...plan.units.map(u => u.x + Math.max(u.w, u.h))), y1 = Math.max(...plan.units.map(u => u.y + Math.max(u.w, u.h)));
    const pad = 20, w = Math.max(200, x1 - x0 + 2 * pad), h = Math.max(120, y1 - y0 + 2 * pad);
    return `${Math.max(0, x0 - pad)} ${Math.max(0, y0 - pad)} ${w} ${h}`;
  }, [plan]);
  const pair = cur && rows.find(r => r.splitFromId === cur.unitId || r.unitId === cur.splitFromId);
  return <div className="live-floor" data-testid="live-floor">
    <div className="live-floor-head">
      <div><span className={"floor-badge " + (plan.active ? "on" : "off")}>{plan.active ? "Active — visible to customers" : "Inactive — hidden from customers"}</span>
        <p className="micro">Inactive floors are hidden on the website and in the customer portal; existing bookings, quotations and invoices on them stay valid.</p></div>
      {canEdit && <div className="live-floor-toggle">
        <button type="button" className={plan.active ? "ghost" : ""} disabled={busy} onClick={() => void run(plan.active
          ? {title: `Set ${plan.title} inactive?`, tone: "danger", confirmLabel: "Yes, set inactive", changes: ["The floor is hidden on the website floorplan and in the customer portal."],
              impact: ["Customers can no longer choose booths on this floor.", `${summary ? summary.booked + " booked/reserved booth(s)" : "Existing bookings"}, quotations and invoices on it stay valid and manageable in the CMS.`, "You can set it active again at any time."]}
          : {title: `Set ${plan.title} active?`, tone: "info", confirmLabel: "Yes, set active", changes: ["The floor appears on the website floorplan and in the customer portal."], impact: ["Customers can request available booths on this floor."]},
          async why => { await api("/api/admin/floorplans/" + plan.id + "/activation", "POST", {active: !plan.active, reason: why}); return plan.active ? "Floor deactivated." : "Floor activated."; })}>
          {plan.active ? "Set inactive" : "Set active"}</button></div>}
    </div>
    {summary && <dl className="prospects-kpis">
      <div><dt>Booths</dt><dd>{summary.booths}</dd></div>
      <div><dt>Booked / reserved</dt><dd>{summary.booked}<small>{summary.bookedArea} m²</small></dd></div>
      <div><dt>Available</dt><dd>{summary.available}<small>{summary.availableArea} m²</small></dd></div>
    </dl>}
    {(canEdit || canBook) && <label className="live-floor-reason">Reason for changes (optional here; asked again in the confirmation)<input value={reason} maxLength={500} placeholder="e.g. Deal signed with PT Contoh by phone, 12 Nov" onChange={e => setReason(e.target.value)} /></label>}
    {msg && <p className="notice" role="status">{msg}</p>}
    <div className="live-floor-grid">
      <div className="floorplan-frame">
        <p className="micro legend"><i style={{background: FILL.booked}} /> Booked <i style={{background: FILL.reserved}} /> Reserved <i style={{background: FILL.free, borderColor: "#067647"}} /> Available <i style={{background: FILL.blocked}} /> Unavailable · click a booth</p>
        <svg viewBox={viewBox} aria-label={"Live floor " + plan.title + " with company names"}>
          {plan.backgroundUrl && <image href={plan.backgroundUrl} x="0" y="0" width={plan.canvasWidth} height={plan.canvasHeight} preserveAspectRatio="xMidYMid meet" />}
          {plan.units.map(u => { const r = u.id ? byId.get(u.id) : undefined; if (!r) return null; const t = tone(r), on = sel === r.unitId;
            const fs = Math.max(8, Math.min(13, u.w / 7));
            return <g key={u.id} role="button" tabIndex={0} aria-pressed={on} aria-label={r.code + ", " + r.areaSqm + " m², " + (r.occupant ? "booked by " + r.occupant.company : r.status.toLowerCase())}
              onClick={() => setSel(r.unitId)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(r.unitId); } }}
              transform={u.rotation ? `rotate(${u.rotation} ${u.x} ${u.y})${u.rotation === 90 ? ` translate(0 ${-u.h})` : u.rotation === 180 ? ` translate(${-u.w} ${-u.h})` : ` translate(${-u.w} 0)`}` : undefined}>
              <rect x={u.x} y={u.y} width={u.w} height={u.h} rx={3} fill={FILL[t]} stroke={on ? "#101828" : t === "free" ? "#067647" : "#fff"} strokeWidth={on ? 4 : 1.5} />
              <text x={u.x + 4} y={u.y + fs + 2} fontSize={fs} fontWeight={700} fill={t === "booked" ? "#fff" : "#101828"} pointerEvents="none">{r.code}</text>
              {r.occupant && <text x={u.x + 4} y={u.y + 2 * fs + 5} fontSize={fs - 1} fill={t === "booked" ? "#fff" : "#101828"} pointerEvents="none">{short(r.occupant.company, Math.max(4, Math.floor(u.w / (fs * 0.55))))}</text>}
              <title>{r.code + (r.occupant ? " — " + r.occupant.company : "")}</title></g>; })}
        </svg>
      </div>
      <aside className="live-floor-side">
        {!cur ? <p className="micro">Select a booth on the map or in the list to see who booked it, add a booking made outside the portal, or split its area.</p> : <>
          <h3>{cur.code} <span className="micro">{cur.hall ? cur.hall + " · " : ""}{cur.areaSqm} m² · {cur.status.toLowerCase()}</span></h3>
          {cur.occupant ? <div className="occupant"><strong>{cur.occupant.company}</strong><span className="micro">{SOURCE[cur.occupant.source]}{cur.occupant.requestStatus ? " · " + cur.occupant.requestStatus.replaceAll("_", " ").toLowerCase() : ""}</span>
            {cur.occupant.contact && <span className="micro">{cur.occupant.contact}</span>}
            {cur.occupant.requestId && <a href={"/admin/booths?request=" + cur.occupant.requestId}>Open booth request →</a>}</div> : <p className="micro">No company yet.</p>}
          {cur.interested.length > 0 && <div><strong className="micro">Also requested by</strong><ul className="interested">{cur.interested.map(i => <li key={i.requestId}><a href={"/admin/booths?request=" + i.requestId}>{i.company}</a> <span className="micro">{i.status.replaceAll("_", " ").toLowerCase()}</span></li>)}</ul></div>}
          {canBook && cur.occupant?.source !== "BOOKING" && cur.occupant?.source !== "HOLD" && (cur.status === "AVAILABLE" || cur.occupant?.source === "MANUAL") && <fieldset><legend>Booked by (deal outside the portal)</legend>
            <label>Company<input value={company} maxLength={180} placeholder="PT …" onChange={e => setCompany(e.target.value)} /></label>
            <label>Contact (name / phone / e-mail, optional)<input value={contact} maxLength={200} onChange={e => setContact(e.target.value)} /></label>
            <div className="seg" role="radiogroup" aria-label="Booking state">{(["OCCUPIED", "RESERVED"] as const).map(s => <label key={s} className="consent"><input type="radio" checked={st === s} onChange={() => setSt(s)} /> {s === "OCCUPIED" ? "Booked (final)" : "Reserved (tentative)"}</label>)}</div>
            <div className="cms-row-actions">
              <button type="button" disabled={busy || company.trim().length < 2} onClick={() => void run({title: `Mark ${cur.code} as ${st === "OCCUPIED" ? "booked" : "reserved"} by ${company.trim()}?`, tone: "warning", confirmLabel: "Yes, save",
                changes: [`${cur.code} shows ${company.trim()} on the live floor (${st === "OCCUPIED" ? "booked, final" : "reserved, tentative"}).`], impact: ["The booth is no longer available to customers in the portal.", "No invoice or quotation is created; this records a deal made outside the portal."]},
                async why => { await api(`/api/admin/floorplans/${plan.id}/units/${cur.unitId}/occupant`, "PUT", {company: company.trim(), contact: contact.trim() || null, status: st, reason: why}); return cur.code + " booked by " + company.trim() + "."; })}>Save booked by</button>
              {cur.occupant?.source === "MANUAL" && <button type="button" className="ghost" disabled={busy} onClick={() => void run({title: `Clear the manual booking on ${cur.code}?`, tone: "warning", confirmLabel: "Yes, make available",
                changes: [`${cur.occupant?.company || "The company"} is removed from ${cur.code}.`], impact: ["The booth becomes available to customers in the portal again."]},
                async why => { await api(`/api/admin/floorplans/${plan.id}/units/${cur.unitId}/occupant`, "PUT", {company: null, reason: why}); return cur.code + " is available again."; })}>Clear (make available)</button>}
            </div></fieldset>}
          {canEdit && <fieldset><legend>Change booth size</legend>
            <p className="micro">Split: {cur.code} keeps its bookings and the area you enter; the rest becomes a new available booth next to it (e.g. 10 m² → 5 m² + 5 m²).</p>
            <label>Area to keep for {cur.code} (m²)<input type="number" min={1} step={0.1} max={cur.areaSqm - 1} value={keep} onChange={e => setKeep(e.target.value)} /></label>
            {keep && Number(keep) > 0 && Number(keep) < cur.areaSqm && <p className="micro">→ {cur.code}: {Number(keep)} m² · new booth: {Math.round((cur.areaSqm - Number(keep)) * 10) / 10} m² (available)</p>}
            <div className="cms-row-actions">
              <button type="button" disabled={busy || !(Number(keep) >= 1 && Number(keep) <= cur.areaSqm - 1)} onClick={() => void run({title: `Split ${cur.code}?`, tone: "warning", confirmLabel: "Yes, split booth",
                changes: [`${cur.code}: ${cur.areaSqm} m² → ${Number(keep)} m² (keeps its bookings).`, `New available booth: ${Math.round((cur.areaSqm - Number(keep)) * 10) / 10} m².`],
                impact: ["Quotations sent for the old size may need a new quotation.", "You can merge the two booths back later."]}, async why => {
                const r = await api(`/api/admin/floorplans/${plan.id}/units/${cur.unitId}/split`, "POST", {keepAreaSqm: Number(keep), reason: why});
                return `${r.keep.code} is now ${r.keep.areaSqm} m²; ${r.rest.code} (${r.rest.areaSqm} m²) is available.` + (r.quotationsToReview.length ? " Review " + r.quotationsToReview.length + " quotation(s) sent for the old size." : ""); })}>Split booth</button>
              {pair && <button type="button" className="ghost" disabled={busy} onClick={() => void run({title: `Merge ${cur.code} with ${pair.code}?`, tone: "warning", confirmLabel: "Yes, merge",
                changes: [`${cur.code} and ${pair.code} become one booth again.`], impact: ["Only possible when the split-off part has no booking; otherwise the server refuses it."]},
                async why => { const r = await api(`/api/admin/floorplans/${plan.id}/units/${cur.unitId}/merge`, "POST", {withUnitId: pair.unitId, reason: why}); return `${r.unit.code} merged back to ${r.unit.areaSqm} m².`; })}>Merge with {pair.code}</button>}
            </div></fieldset>}
        </>}
      </aside>
    </div>
    <div className="live-floor-list">
      <div className="cms-row-actions"><label>Search booth or company<input type="search" value={q} onChange={e => setQ(e.target.value)} /></label>
        <div className="seg" role="group" aria-label="Show">{([["", "All"], ["booked", "Booked"], ["free", "Available"]] as const).map(([v, l]) => <button type="button" key={v} aria-pressed={only === v} className={only === v ? "" : "ghost"} onClick={() => setOnly(v)}>{l}</button>)}</div></div>
      <div className="cms-table-wrap"><table className="cms-table"><thead><tr><th>Booth</th><th>Area</th><th>Status</th><th>Booked by</th><th>Requested by</th></tr></thead><tbody>
        {list.map(r => <tr key={r.unitId} className={sel === r.unitId ? "is-selected" : ""} onClick={() => setSel(r.unitId)} style={{cursor: "pointer"}}>
          <td><strong>{r.code}</strong>{r.hall && <small> · {r.hall}</small>}</td><td>{r.areaSqm} m²</td>
          <td><span className={"tag " + (tone(r) === "booked" ? "brand" : tone(r) === "free" ? "ok" : "")}>{r.occupant ? (tone(r) === "booked" ? "Booked" : "Reserved") : r.status === "AVAILABLE" ? "Available" : "Unavailable"}</span></td>
          <td>{r.occupant ? <>{r.occupant.company}<small> {SOURCE[r.occupant.source]}</small></> : "—"}</td>
          <td>{r.interested.map(i => i.company).join(", ") || "—"}</td></tr>)}
      </tbody></table></div>
    </div>
  </div>;
}
