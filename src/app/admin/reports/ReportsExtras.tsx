"use client";
import {useCallback, useEffect, useState} from "react";
type Kpi = {key: string; value: number | string; basis: string};
type Job = {id: string; reportType: string; format: string; state: string; rowCount: number; expiresAt: string | null; createdAt: string; filters: {error?: string}};
const LABEL: Record<string, string> = {accountsCreated: "Accounts created", accountsVerified: "Accounts verified", visitorRegistrations: "Visitor registrations", conferenceBookings: "Conference bookings",
  exhibitorRequests: "Booth requests", uniqueRegistrants: "Unique registrants", requestedAreaSqm: "Requested m²", quotationsIssued: "Quotations issued", assignedAreaSqm: "Assigned m²",
  uniqueArrivals: "Unique arrivals", admissions: "Admissions", invoicesIssued: "Invoices issued", verifiedReceiptsIdr: "Verified receipts (IDR)"};

/** FR-149 KPI period presets + NFR-26 background exports with expiring, requester-only downloads. */
export function ReportsExtras({canExport, exportQuery}: {canExport: boolean; exportQuery: Record<string, string>}) {
  const [period, setPeriod] = useState("30d"), [from, setFrom] = useState(""), [to, setTo] = useState(""), [kpis, setKpis] = useState<Kpi[]>([]), [jobs, setJobs] = useState<Job[]>([]), [msg, setMsg] = useState("");
  const loadKpi = useCallback(async () => {
    if (period === "custom" && (!from || !to)) return;
    const q = new URLSearchParams({period, ...(period === "custom" ? {from, to} : {})});
    const r = await fetch("/api/admin/reports/kpi?" + q, {cache: "no-store"}); const j = await r.json();
    if (r.ok) { setKpis(j.kpis); setMsg(""); } else setMsg(j.message);
  }, [period, from, to]);
  const loadJobs = useCallback(async () => { if (!canExport) return; const r = await fetch("/api/admin/exports", {cache: "no-store"}); if (r.ok) setJobs((await r.json()).jobs); }, [canExport]);
  useEffect(() => { void loadKpi(); }, [loadKpi]);
  useEffect(() => { void loadJobs(); const t = setInterval(() => void loadJobs(), 15000); return () => clearInterval(t); }, [loadJobs]);
  const queue = async () => {
    const r = await fetch("/api/admin/exports", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({...exportQuery, format: exportQuery.format || "xlsx"})});
    const j = await r.json(); setMsg(r.ok ? "Background export queued. It appears below when ready (link valid 24 h, only for you)." : j.message); void loadJobs();
  };
  return <section className="cms-card" aria-labelledby="kpi-h"><h2 id="kpi-h">KPI overview</h2>
    <div className="cms-row-actions" role="group" aria-label="Period">{[["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["month", "This month"], ["all", "All time"], ["custom", "Custom"]].map(([k, l]) =>
      <button key={k} type="button" className={period === k ? "chosen cms-small" : "ghost cms-small"} aria-pressed={period === k} onClick={() => setPeriod(k)}>{l}</button>)}
      {period === "custom" && <><label>From<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>To<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label></>}</div>
    <div className="cms-kpi-grid">{kpis.map(k => <div key={k.key} className="cms-kpi"><span>{LABEL[k.key] || k.key}</span><strong>{typeof k.value === "string" ? Number(k.value).toLocaleString("id-ID") : k.value.toLocaleString("id-ID")}</strong><small title={k.basis}>basis: {k.basis}</small></div>)}</div>
    {canExport && <><h3>Background exports (up to 100,000 rows)</h3><button type="button" onClick={() => void queue()}>Queue export with current filters</button>
      <table className="cms-table"><thead><tr><th>Requested</th><th>Report</th><th>Rows</th><th>Status</th><th /></tr></thead><tbody>
        {jobs.filter(j => j.state !== "COMPLETED" || j.expiresAt).slice(0, 15).map(j => <tr key={j.id}><td>{new Date(j.createdAt).toLocaleString("en-GB", {timeZone: "Asia/Jakarta"})}</td><td>{j.reportType} · {j.format}</td><td>{j.rowCount}</td>
          <td>{j.state}{j.filters?.error ? " — " + j.filters.error : ""}</td><td>{j.state === "COMPLETED" && j.expiresAt && new Date(j.expiresAt) > new Date() && <a href={"/api/admin/exports/" + j.id + "/download"}>Download</a>}</td></tr>)}
      </tbody></table></>}
    {msg && <p role="status" className="micro">{msg}</p>}
  </section>;
}
