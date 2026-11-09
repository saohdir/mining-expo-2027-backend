"use client";
/** Relational picker for the draft-invoice form: find the customer by name/email/company, then choose one of *their* bookings.
 * Replaces typing raw account and booking IDs (error prevention). Uses existing read APIs only. */
import {useEffect, useId, useState} from "react";

type Hit = {id: string; email: string | null; profile: {fullName: string; organization: string | null} | null};
type Detail = {id: string; email: string | null; profile: {fullName: string; organization: string | null} | null;
  enrollments: {id: string; type: string; status: string; conference: string | null}[]; requests: {id: string; status: string; requestedAreaSqm: string; assigned: string[]}[]};
export type Kind = "enrollmentId" | "boothRequestId";

export function CustomerPicker({accountId, bookingId, kind, onChange}: {accountId: string; bookingId: string; kind: Kind; onChange: (v: {accountId: string; bookingId: string; kind: Kind}) => void}) {
  const uid = useId();
  const [q, setQ] = useState(""), [hits, setHits] = useState<Hit[]>([]), [open, setOpen] = useState(false), [active, setActive] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null), [err, setErr] = useState(""), [loading, setLoading] = useState(false);
  // Load the chosen customer (also when the form is pre-filled from a registration, booth or payment request).
  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(accountId)) { setDetail(null); return; }
    if (detail?.id === accountId) return;
    let live = true; setErr("");
    fetch("/api/admin/customers/" + accountId, {cache: "no-store"}).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || "Customer not found."); return j; })
      .then(j => { if (live) setDetail(j); }).catch(e => { if (live) { setDetail(null); setErr((e as Error).message); } });
    return () => { live = false; };
  }, [accountId, detail?.id]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const ctl = new AbortController(); setLoading(true);
    const t = setTimeout(() => {
      fetch("/api/admin/customers?pageSize=10&q=" + encodeURIComponent(q.trim()), {cache: "no-store", signal: ctl.signal}).then(r => r.ok ? r.json() : {customers: []})
        .then(j => { setHits(j.customers || []); setActive(0); setOpen(true); }).catch(() => {}).finally(() => { if (!ctl.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);
  const choose = (h: Hit) => { setOpen(false); setQ(""); setDetail(null); onChange({accountId: h.id, bookingId: "", kind}); };
  const bookings = detail ? [
    ...detail.enrollments.filter(e => e.type === "CONFERENCE").map(e => ({kind: "enrollmentId" as Kind, id: e.id, label: `Conference · ${e.conference || "programme"} · ${e.status.toLowerCase().replace(/_/g, " ")} · ${e.id.slice(0, 8)}`})),
    ...detail.requests.map(r => ({kind: "boothRequestId" as Kind, id: r.id, label: `Booth · ${r.requestedAreaSqm} m²${r.assigned.length ? " · " + r.assigned.join(", ") : ""} · ${r.status.toLowerCase().replace(/_/g, " ")} · ${r.id.slice(0, 8)}`}))] : [];

  return <div className="cms-picker-wrap">
    {detail ? <div className="cms-picked"><div><strong>{detail.profile?.fullName || detail.email}</strong><span className="cms-sub">{[detail.profile?.organization, detail.email].filter(Boolean).join(" · ")}</span></div><span className="sp"/>
      <button type="button" className="ghost cms-small" onClick={() => { setDetail(null); onChange({accountId: "", bookingId: "", kind}); }}>Change customer</button></div>
    : <div className="cms-picker"><label htmlFor={uid + "-q"}>Customer</label>
      <input id={uid + "-q"} role="combobox" aria-expanded={open && hits.length > 0} aria-controls={uid + "-list"} aria-autocomplete="list" autoComplete="off"
        aria-activedescendant={open && hits[active] ? uid + "-o" + active : undefined} placeholder="Type a name, email or company" value={q}
        onChange={e => setQ(e.target.value)} onFocus={() => hits.length && setOpen(true)}
        onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(hits.length - 1, a + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
          else if (e.key === "Enter" && open && hits[active]) { e.preventDefault(); choose(hits[active]); } else if (e.key === "Escape") setOpen(false); }}/>
      {open && q.trim().length > 1 && <ul id={uid + "-list"} role="listbox" aria-label="Matching customers">{loading && !hits.length ? <li aria-disabled="true">Searching…</li> : !hits.length ? <li aria-disabled="true">No customers match “{q.trim()}”.</li>
        : hits.map((h, i) => <li key={h.id} id={uid + "-o" + i} role="option" aria-selected={i === active} onMouseDown={e => { e.preventDefault(); choose(h); }}>{h.profile?.fullName || h.email}<small>{[h.profile?.organization, h.email].filter(Boolean).join(" · ")}</small></li>)}</ul>}
    </div>}
    {err && <p className="cms-dl-error" role="alert">{err}</p>}
    {detail && <label>Booking to invoice<select required value={bookingId ? kind + ":" + bookingId : ""} onChange={e => { const [k, id] = e.target.value.split(":"); onChange({accountId: detail.id, bookingId: id || "", kind: (k as Kind) || kind}); }}>
      <option value="">{bookings.length ? "Choose a conference booking or booth request" : "This customer has no conference booking or booth request"}</option>
      {bookings.map(b => <option key={b.id} value={b.kind + ":" + b.id}>{b.label}</option>)}</select></label>}
    <details className="cms-picker-manual"><summary>Enter IDs manually</summary>
      <label>Customer account ID<input value={accountId} onChange={e => onChange({accountId: e.target.value.trim(), bookingId, kind})}/></label>
      <label>{kind === "enrollmentId" ? "Conference enrollment ID" : "Booth request ID"}<input value={bookingId} onChange={e => onChange({accountId, bookingId: e.target.value.trim(), kind})}/></label>
      <label>Booking type<select value={kind} onChange={e => onChange({accountId, bookingId, kind: e.target.value as Kind})}><option value="enrollmentId">Conference</option><option value="boothRequestId">Booth</option></select></label>
    </details>
  </div>;
}
