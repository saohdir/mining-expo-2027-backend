"use client";
import {useEffect, useState} from "react";
type Data = {from: string; to: string; events: string[]; totals: Record<string, number>; days: {day: string; counts: Record<string, number>}[]};
const LABEL: Record<string, string> = {otp_requested: "OTP requested", otp_verified: "OTP verified", registration_started: "Registrations started", booth_requested: "Booth requests",
  invoice_issued: "Invoices issued", manual_transfer_verified: "Transfers verified", qr_pass_issued: "QR passes issued", checkin_accepted: "Check-ins accepted", checkin_denied: "Check-ins denied", report_exported: "Reports exported"};

/** NFR-10: aggregated, non-PII funnel counters per WIB day. */
export function FunnelAnalytics() {
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [d, setD] = useState<Data | null>(null), [msg, setMsg] = useState("");
  useEffect(() => { const q = new URLSearchParams({...(from ? {from} : {}), ...(to ? {to} : {})}); fetch("/api/admin/reports/analytics?" + q, {cache: "no-store"}).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.message); setD(j); setMsg(""); }).catch(e => setMsg(e.message)); }, [from, to]);
  return <section className="cms-panel reports-surface" aria-labelledby="funnel-h"><p className="eyebrow">PRIVACY-SAFE ANALYTICS</p><h2 id="funnel-h">Funnel events</h2>
    <p className="micro">Daily counts only (WIB). No names, emails, IP addresses or tokens are stored. Default: last 30 days.</p>
    <div className="form-grid"><label>From<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>To<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div>
    {msg && <p role="alert" className="micro">{msg}</p>}
    {d && <><dl className="cms-stats">{d.events.map(e => <div key={e}><dt>{LABEL[e] || e}</dt><dd>{d.totals[e] ?? 0}</dd></div>)}</dl>
      {d.days.length > 0 && <div style={{overflowX: "auto"}}><table className="cms-table"><caption className="micro">{d.from} – {d.to}</caption><thead><tr><th>Day</th>{d.events.map(e => <th key={e}>{LABEL[e] || e}</th>)}</tr></thead>
        <tbody>{d.days.map(r => <tr key={r.day}><td>{r.day}</td>{d.events.map(e => <td key={e}>{r.counts[e] ?? 0}</td>)}</tr>)}</tbody></table></div>}</>}
  </section>;
}
