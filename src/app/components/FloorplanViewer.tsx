"use client";
import {useEffect, useMemo, useRef, useState} from "react";

type Unit = {id: string; code: string; category: string; hall: string | null; zone: string | null; x: number; y: number; w: number; h: number; rotation?: number;
  areaSqm: string; lengthM: string | null; widthM: string | null; dimensionLabel: string | null; status: string; approvedPublicName: string | null; categoryColor: string | null};
type Plan = {state: "PUBLISHED" | "COMING_SOON"; version?: number; title?: string; backgroundUrl?: string | null; backgroundAlt?: string | null; canvas?: {width: number; height: number}; units: Unit[]};
const LABEL: Record<string, string> = {AVAILABLE: "Available", RESERVED: "Reserved", OCCUPIED: "Occupied", BLOCKED: "Unavailable"};
const size = (u: Unit) => u.lengthM && u.widthM ? `${u.lengthM} by ${u.widthM} metres` : (u.dimensionLabel || "");
export const accessibleName = (u: Unit) => [u.code, size(u), u.areaSqm + " square metres", u.status === "OCCUPIED" && u.approvedPublicName ? "occupied by " + u.approvedPublicName : LABEL[u.status] || u.status].filter(Boolean).join(", ");

/** Public, read-only published map (FR-015/104/105/106/108/109, AT-091/092). Selecting an
 * AVAILABLE unit only starts an account-gated preference request — never a reservation. */
export function FloorplanViewer({requestHref = (id: string) => "/account?request=" + encodeURIComponent(id) + "#booth"}: {requestHref?: (id: string) => string}) {
  const [plan, setPlan] = useState<Plan | null>(null), [err, setErr] = useState("");
  const [q, setQ] = useState(""), [hall, setHall] = useState(""), [zone, setZone] = useState(""), [onlyAvailable, setOnlyAvailable] = useState(false);
  const [view, setView] = useState<"map" | "list">("map"), [zoom, setZoom] = useState(1), [pan, setPan] = useState({x: 0, y: 0}), [focus, setFocus] = useState<Unit | null>(null);
  const drag = useRef<{x: number; y: number; px: number; py: number} | null>(null);
  useEffect(() => { fetch("/api/public/floorplan", {cache: "no-store"}).then(r => r.json()).then(setPlan).catch(() => setErr("Floorplan is temporarily unavailable.")); }, []);
  const units = useMemo(() => (plan?.units || []).filter(u => (!hall || u.hall === hall) && (!zone || u.zone === zone) && (!onlyAvailable || u.status === "AVAILABLE") &&
    (!q || (u.code + " " + (u.approvedPublicName || "")).toLowerCase().includes(q.toLowerCase()))), [plan, hall, zone, onlyAvailable, q]);
  if (err) return <p role="alert">{err}</p>;
  if (!plan) return <p role="status">Loading floorplan…</p>;
  if (plan.state !== "PUBLISHED" || !plan.canvas) return <section className="floorplan-empty"><h2>Floorplan coming soon</h2><p>The organizer has not published an approved booth map yet. No availability is shown until it is published.</p></section>;
  const halls = [...new Set(plan.units.map(u => u.hall).filter(Boolean))] as string[], zones = [...new Set(plan.units.map(u => u.zone).filter(Boolean))] as string[];
  const vb = {w: plan.canvas.width / zoom, h: plan.canvas.height / zoom};
  const clampPan = (p: {x: number; y: number}) => ({x: Math.max(0, Math.min(plan.canvas!.width - vb.w, p.x)), y: Math.max(0, Math.min(plan.canvas!.height - vb.h, p.y))});
  const setZ = (z: number) => { const nz = Math.max(1, Math.min(6, Math.round(z * 10) / 10)); setZoom(nz); setPan(p => ({x: Math.min(p.x, plan.canvas!.width - plan.canvas!.width / nz), y: Math.min(p.y, plan.canvas!.height - plan.canvas!.height / nz)})); };
  const move = (dx: number, dy: number) => setPan(p => clampPan({x: p.x + dx * vb.w * 0.2, y: p.y + dy * vb.h * 0.2}));
  const noneAvailable = !plan.units.some(u => u.status === "AVAILABLE");
  return <section className="floorplan-viewer" aria-label={"Published floorplan " + (plan.title || "")}>
    <div className="floorplan-toolbar" role="toolbar" aria-label="Floorplan filters and view">
      <label>Search booth or exhibitor<input type="search" value={q} onChange={e => setQ(e.target.value)} /></label>
      {halls.length > 0 && <label>Hall<select value={hall} onChange={e => setHall(e.target.value)}><option value="">All halls</option>{halls.map(h => <option key={h}>{h}</option>)}</select></label>}
      {zones.length > 0 && <label>Zone<select value={zone} onChange={e => setZone(e.target.value)}><option value="">All zones</option>{zones.map(z => <option key={z}>{z}</option>)}</select></label>}
      <label className="consent"><input type="checkbox" checked={onlyAvailable} onChange={e => setOnlyAvailable(e.target.checked)} /> Available only</label>
      <button type="button" aria-pressed={view === "list"} onClick={() => setView(v => v === "map" ? "list" : "map")}>{view === "map" ? "Show list view" : "Show map view"}</button>
    </div>
    {noneAvailable && <p role="status" className="warning">No booth is currently available on the published map. You may still contact the organizer.</p>}
    <p className="micro">Legend: <span className="fp-key fp-available">Available (hatched)</span> <span className="fp-key fp-reserved">Reserved</span> <span className="fp-key fp-occupied">Occupied</span> <span className="fp-key fp-blocked">Unavailable</span>. Selecting a booth sends a preference request; the organizer confirms any allocation.</p>
    {view === "map" ? <>
      <div className="cms-row-actions" role="group" aria-label="Zoom and pan">
        <button type="button" onClick={() => setZ(zoom + 0.5)} aria-label="Zoom in">+</button><button type="button" onClick={() => setZ(zoom - 0.5)} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => { setZoom(1); setPan({x: 0, y: 0}); }}>Reset</button>
        <button type="button" onClick={() => move(-1, 0)} aria-label="Pan left">←</button><button type="button" onClick={() => move(1, 0)} aria-label="Pan right">→</button>
        <button type="button" onClick={() => move(0, -1)} aria-label="Pan up">↑</button><button type="button" onClick={() => move(0, 1)} aria-label="Pan down">↓</button>
        <span className="micro">Zoom {Math.round(zoom * 100)}%</span>
      </div>
      <div className="floorplan-frame" style={{touchAction: "none", overflow: "hidden"}}>
        <svg viewBox={`${pan.x} ${pan.y} ${vb.w} ${vb.h}`} role="group" aria-label="Booth map. Use Tab to move between booths." style={{width: "100%", height: "auto", maxHeight: "75vh"}}
          onKeyDown={e => { if (e.key === "+" || e.key === "=") setZ(zoom + 0.5); if (e.key === "-") setZ(zoom - 0.5); }}
          onPointerDown={e => { drag.current = {x: e.clientX, y: e.clientY, px: pan.x, py: pan.y}; }}
          onPointerMove={e => { const d = drag.current; if (!d || zoom === 1) return; const sc = vb.w / (e.currentTarget.clientWidth || 1); setPan(clampPan({x: d.px - (e.clientX - d.x) * sc, y: d.py - (e.clientY - d.y) * sc})); }}
          onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}
          onWheel={e => { if (e.ctrlKey) { e.preventDefault(); setZ(zoom - Math.sign(e.deltaY) * 0.25); } }}>
          <defs><pattern id="fp-avail" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#ffffff" /><path d="M0 8L8 0" stroke="#2F6FD6" strokeWidth="1.5" /></pattern></defs>
          {plan.backgroundUrl && <image href={plan.backgroundUrl} x={0} y={0} width={plan.canvas.width} height={plan.canvas.height}><title>{plan.backgroundAlt || "Floorplan background"}</title></image>}
          {units.map(u => <g key={u.id} role="button" tabIndex={0} aria-label={accessibleName(u)} aria-pressed={focus?.id === u.id}
            onClick={() => setFocus(u)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFocus(u); } }}
            transform={u.rotation ? `rotate(${u.rotation} ${u.x} ${u.y})${u.rotation === 90 ? ` translate(0 ${-u.h})` : u.rotation === 180 ? ` translate(${-u.w} ${-u.h})` : ` translate(${-u.w} 0)`}` : undefined}>
            <rect x={u.x} y={u.y} width={u.w} height={u.h} stroke={focus?.id === u.id ? "#ff5912" : "#35120a"} strokeWidth={focus?.id === u.id ? 4 : 1}
              fill={u.status === "AVAILABLE" ? "url(#fp-avail)" : u.status === "RESERVED" ? "#F2C14E" : u.status === "OCCUPIED" ? (u.categoryColor || "#6B3FA0") : "#BDBDBD"} />
            <text x={u.x + 4} y={u.y + 14} fontSize={12} fill="#111" pointerEvents="none">{u.code}</text>
            <text x={u.x + 4} y={u.y + 28} fontSize={9} fill="#111" pointerEvents="none">{u.status === "OCCUPIED" && u.approvedPublicName ? u.approvedPublicName.slice(0, 18) : LABEL[u.status]}</text>
          </g>)}
        </svg>
      </div>
    </> : <div className="table-scroll" role="region" aria-label="Booth list" tabIndex={0}><table className="cms-table"><caption>Booths ({units.length})</caption><thead><tr><th>Booth</th><th>Hall / zone</th><th>Size</th><th>Area</th><th>Status</th><th /></tr></thead><tbody>
      {units.map(u => <tr key={u.id}><td>{u.code}</td><td>{[u.hall, u.zone].filter(Boolean).join(" / ") || "—"}</td><td>{u.dimensionLabel || "—"}</td><td>{u.areaSqm} m²</td>
        <td>{u.status === "OCCUPIED" && u.approvedPublicName ? "Occupied by " + u.approvedPublicName : LABEL[u.status]}</td>
        <td>{u.status === "AVAILABLE" && <a href={requestHref(u.id)}>Request this area</a>}</td></tr>)}</tbody></table></div>}
    {focus && <aside className="floorplan-detail" aria-live="polite"><h3>Booth {focus.code}</h3><p>{[focus.hall && "Hall " + focus.hall, focus.zone && "Zone " + focus.zone, focus.dimensionLabel, focus.areaSqm + " m²", focus.category].filter(Boolean).join(" · ")}</p>
      <p><strong>{focus.status === "OCCUPIED" && focus.approvedPublicName ? "Occupied by " + focus.approvedPublicName : LABEL[focus.status]}</strong></p>
      {focus.status === "AVAILABLE" ? <><a className="button" href={requestHref(focus.id)}>Request this area</a><p className="micro">Sign in required. Your request is a preference only — the final booth, area and price are confirmed by the organizer.</p></> : <p className="micro">This booth cannot be requested.</p>}
    </aside>}
  </section>;
}
