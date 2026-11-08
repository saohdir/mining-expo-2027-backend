"use client";
import {useEffect, useState} from "react";

const api = async (path: string, method = "GET", body?: unknown) => {
  const r = await fetch(path, {method, cache: "no-store", headers: body ? {"Content-Type": "application/json"} : undefined, body: body ? JSON.stringify(body) : undefined});
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(data.message || (data.errors ? data.errors.join("; ") : "Request failed"));
  return data;
};
export type Category = {id: string; name: string; colorHex: string; pattern: string; sortOrder: number; _count?: {units: number}};
type Remap = {draftVersion: number; publishedVersion: number | null; hash: string; canApply: boolean; blocking: string[]; areaWarnings: string[]; unplaced: string[];
  summary: {matched: number; unmatched: number; added: number; committedUnits: number};
  rows: {code: string; status: string; oldAreaSqm?: number; newAreaSqm?: number; areaChanged?: boolean; commitments: {kind: string; requestId: string}[]}[]};
type Stats = {totalUnits: number; totalAreaSqm: number; occupiedAreaSqm: number; occupiedPercent: number; byStatus: Record<string, {units: number; areaSqm: number}>; byCategory: Record<string, {units: number; areaSqm: number}>};

/** SVG pattern defs so status/category is never conveyed by colour alone (FR-092/105/109). */
export function PatternDefs({categories}: {categories: Category[]}) {
  return <defs>
    {categories.map(c => <pattern key={c.id} id={"cat-" + c.id} width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" fill={c.colorHex} />
      {c.pattern === "HATCH" && <path d="M0 8L8 0" stroke="#fff" strokeWidth="1.5" />}
      {c.pattern === "DOTS" && <circle cx="4" cy="4" r="1.5" fill="#fff" />}
      {c.pattern === "CROSS" && <path d="M0 0L8 8M8 0L0 8" stroke="#fff" strokeWidth="1" />}
    </pattern>)}
  </defs>;
}

export function CategoryManager({categories, canEdit, onChanged}: {categories: Category[]; canEdit: boolean; onChanged: () => void}) {
  const [f, setF] = useState({name: "", colorHex: "#6B3FA0", pattern: "SOLID"}), [msg, setMsg] = useState("");
  const act = async (fn: () => Promise<unknown>) => { setMsg(""); try { await fn(); onChanged(); } catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); } };
  return <details className="floorplan-panel"><summary>Booth categories ({categories.length})</summary>
    <ul className="micro">{categories.map(c => <li key={c.id}><svg width="18" height="12" aria-hidden="true"><rect width="18" height="12" fill={"url(#cat-" + c.id + ")"} /></svg> {c.name} · {c.colorHex} · {c.pattern} · {c._count?.units ?? 0} units
      {canEdit && <> <input aria-label={"Colour for " + c.name} type="color" defaultValue={c.colorHex} onBlur={e => e.target.value.toUpperCase() !== c.colorHex.toUpperCase() && void act(() => api("/api/admin/booth-categories/" + c.id, "PATCH", {colorHex: e.target.value.toUpperCase()}))} />
        <button className="link" onClick={() => void act(() => api("/api/admin/booth-categories/" + c.id, "DELETE"))}>Delete</button></>}</li>)}</ul>
    {canEdit && <form className="cms-row-actions" onSubmit={e => { e.preventDefault(); void act(() => api("/api/admin/booth-categories", "POST", {...f, colorHex: f.colorHex.toUpperCase()})); }}>
      <label>Name<input required minLength={2} value={f.name} onChange={e => setF({...f, name: e.target.value})} /></label>
      <label>Colour<input type="color" value={f.colorHex} onChange={e => setF({...f, colorHex: e.target.value})} /></label>
      <label>Pattern<select value={f.pattern} onChange={e => setF({...f, pattern: e.target.value})}>{["SOLID", "HATCH", "DOTS", "CROSS"].map(p => <option key={p}>{p}</option>)}</select></label>
      <button>Add category</button></form>}
    {msg && <p role="alert" className="micro">{msg}</p>}
  </details>;
}

export function CsvAndAlign({planId, rowVersion, canEdit, onChanged}: {planId: string; rowVersion: number; canEdit: boolean; onChanged: (m: string) => void}) {
  const [a, setA] = useState({scale: "1", dx: "0", dy: "0", reason: ""}), [msg, setMsg] = useState("");
  return <details className="floorplan-panel"><summary>CSV import/export &amp; align</summary>
    <p className="micro"><a href={"/api/admin/floorplans/" + planId + "/csv"}>Export units CSV</a> (code, category, lengthM, widthM, hall — formula-safe)</p>
    {canEdit && <label>Import CSV (new codes go to the Unplaced tray)<input type="file" accept=".csv,text/csv" onChange={async e => {
      const file = e.target.files?.[0]; if (!file) return; setMsg("");
      const r = await fetch("/api/admin/floorplans/" + planId + "/csv?rowVersion=" + rowVersion, {method: "POST", body: await file.text(), headers: {"Content-Type": "text/csv"}});
      const b = await r.json().catch(() => ({}));
      if (!r.ok) setMsg(b.errors ? b.errors.join("; ") : b.message || "Import failed"); else onChanged(`Imported: ${b.updated} updated, ${b.unplaced} unplaced.`);
      e.target.value = "";
    }} /></label>}
    {canEdit && <form className="cms-row-actions" onSubmit={e => { e.preventDefault(); setMsg("");
      void api("/api/admin/floorplans/" + planId + "/align", "POST", {rowVersion, scale: Number(a.scale), dx: Number(a.dx), dy: Number(a.dy), reason: a.reason}).then(b => onChanged("Aligned " + b.aligned + " units.")).catch(err => setMsg(err.message)); }}>
      <label>Scale<input type="number" step="0.01" min="0.1" max="10" value={a.scale} onChange={e => setA({...a, scale: e.target.value})} /></label>
      <label>Offset X<input type="number" value={a.dx} onChange={e => setA({...a, dx: e.target.value})} /></label>
      <label>Offset Y<input type="number" value={a.dy} onChange={e => setA({...a, dy: e.target.value})} /></label>
      <label>Reason<input minLength={8} required value={a.reason} onChange={e => setA({...a, reason: e.target.value})} /></label>
      <button>Apply align to all placed units</button></form>}
    {msg && <p role="alert" className="micro">{msg}</p>}
  </details>;
}

export function RemapReport({planId, onReport}: {planId: string; onReport: (r: Remap | null) => void}) {
  const [r, setR] = useState<Remap | null>(null), [err, setErr] = useState("");
  useEffect(() => { api("/api/admin/floorplans/" + planId + "/remap-report").then(x => { setR(x); onReport(x); }).catch(e => { setErr(e.message); onReport(null); }); }, [planId, onReport]);
  if (err) return <p className="warning micro">Remap report unavailable: {err}</p>;
  if (!r) return <p className="micro">Loading remap report…</p>;
  if (r.publishedVersion === null) return <p className="micro">No published version yet — no remap needed.</p>;
  const committed = r.rows.filter(x => x.commitments.length || x.status !== "MATCHED");
  return <div className="floorplan-remap" role="region" aria-label="Remap report">
    <p className="micro"><strong>Remap v{r.publishedVersion} → v{r.draftVersion}</strong>: {r.summary.matched} matched by code · {r.summary.unmatched} missing · {r.summary.added} new · {r.summary.committedUnits} units with customer commitments.</p>
    {r.blocking.length > 0 && <p className="warning micro" role="alert">Blocked: committed units missing in this draft: {r.blocking.join(", ")}. Add units with the same codes or resolve the bookings first.</p>}
    {r.areaWarnings.length > 0 && <p className="warning micro">Area changed for committed units: {r.areaWarnings.join(", ")}. Assignment will require an area override reason.</p>}
    {r.unplaced.length > 0 && <p className="warning micro">Unplaced units must be placed before publishing: {r.unplaced.join(", ")}</p>}
    {committed.length > 0 && <table className="cms-table"><thead><tr><th>Code</th><th>Result</th><th>Area</th><th>Commitments</th></tr></thead><tbody>
      {committed.slice(0, 100).map(x => <tr key={x.code}><td>{x.code}</td><td>{x.status}</td><td>{x.oldAreaSqm ?? "—"} → {x.newAreaSqm ?? "—"} m²</td><td>{x.commitments.map(c => c.kind).join(", ") || "—"}</td></tr>)}
    </tbody></table>}
  </div>;
}

export function StatsPanel({planId}: {planId: string}) {
  const [s, setS] = useState<Stats | null>(null);
  useEffect(() => { api("/api/admin/floorplans/" + planId + "/stats").then(setS).catch(() => setS(null)); }, [planId]);
  if (!s) return null;
  return <details className="floorplan-panel"><summary>Statistics: {s.totalUnits} units · {s.occupiedAreaSqm}/{s.totalAreaSqm} m² occupied ({s.occupiedPercent}%)</summary>
    <ul className="micro">{Object.entries(s.byStatus).map(([k, v]) => <li key={k}>{k}: {v.units} units · {v.areaSqm} m²</li>)}</ul>
    <ul className="micro">{Object.entries(s.byCategory).map(([k, v]) => <li key={k}>{k}: {v.units} units · {v.areaSqm} m²</li>)}</ul>
    <a href={"/api/admin/floorplans/" + planId + "/stats?format=csv"}>Export statistics CSV</a>
  </details>;
}
