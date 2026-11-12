"use client";
import type {KeyboardEvent} from "react";
import {boothFill, boothText, STATUS_FILL} from "@/lib/booth-colors";

/** One booth drawn the same way on the public floorplan and the customer booth picker:
 * CMS category colour when available, status colour when booked, thin outline, label sized to the box. */
export type BoothShapeUnit = {id: string; code: string; x: number; y: number; w: number; h: number; rotation?: number; status: string;
  categoryColor?: string | null; dimensionLabel?: string | null; approvedPublicName?: string | null};
export const STATUS_LABEL: Record<string, string> = {AVAILABLE: "Available", RESERVED: "Reserved", OCCUPIED: "Occupied", BLOCKED: "Unavailable", UNAVAILABLE: "Not available"};
export const SELECTED_FILL = "#C2410C";

export function BoothShape({u, label, focused = false, selected = false, onActivate, focusable = true}: {u: BoothShapeUnit; label: string; focused?: boolean; selected?: boolean; onActivate?: () => void; focusable?: boolean}) {
  const fill = selected ? SELECTED_FILL : boothFill(u.status, u.categoryColor), ink = selected ? "#fff" : boothText(fill);
  const fs = Math.max(7, Math.min(13, u.w / 4.5, u.h / 2.6));
  const second = selected ? "Selected" : u.status === "AVAILABLE" ? (u.dimensionLabel || "") : (u.approvedPublicName || STATUS_LABEL[u.status] || "");
  const key = (e: KeyboardEvent) => { if (onActivate && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onActivate(); } };
  return <g role="button" tabIndex={focusable ? 0 : -1} aria-label={label} aria-pressed={selected || focused} onClick={onActivate} onKeyDown={key}
    style={{cursor: onActivate ? "pointer" : "default"}}
    transform={u.rotation ? `rotate(${u.rotation} ${u.x} ${u.y})${u.rotation === 90 ? ` translate(0 ${-u.h})` : u.rotation === 180 ? ` translate(${-u.w} ${-u.h})` : ` translate(${-u.w} 0)`}` : undefined}>
    <rect x={u.x} y={u.y} width={u.w} height={u.h} rx={1.5} stroke={focused || selected ? "#ff5912" : "rgba(53,18,10,.35)"} strokeWidth={focused || selected ? 4 : 0.8} fill={fill} />
    <text x={u.x + 3} y={u.y + fs + 2} fontSize={fs} fontWeight={600} fill={ink} pointerEvents="none">{u.code}</text>
    {second && u.h > fs * 2.4 && <text x={u.x + 3} y={u.y + fs * 2 + 4} fontSize={Math.max(6, fs * 0.72)} fill={ink} opacity={0.85} pointerEvents="none">{second.slice(0, Math.max(6, Math.floor(u.w / (fs * 0.45))))}</text>}
  </g>;
}

/** Legend shared by both maps: available booths by CMS category, then booked statuses. */
export function BoothLegend({categories, units, display, selectable = false, note}: {categories?: {name: string; colorHex: string | null}[]; units: {status: string; categoryName?: string | null}[]; display?: "names" | "status"; selectable?: boolean; note?: string}) {
  const cats = categories?.length ? categories.filter(c => units.some(u => u.status === "AVAILABLE" && (u.categoryName || "") === c.name)) : [{name: "Booth", colorHex: null}];
  return <div className="fp-legend micro" aria-label="Legend"><strong>Available:</strong>
    {(cats.length ? cats : [{name: "Booth", colorHex: null}]).map(c => <span key={c.name} className="fp-chip"><i style={{background: boothFill("AVAILABLE", c.colorHex)}} />{c.name}</span>)}
    <strong>Booked:</strong>{display === "status" ? <span className="fp-chip"><i style={{background: STATUS_FILL.UNAVAILABLE}} />Not available</span>
      : <><span className="fp-chip"><i style={{background: STATUS_FILL.RESERVED}} />Reserved</span><span className="fp-chip"><i style={{background: STATUS_FILL.OCCUPIED}} />Occupied</span><span className="fp-chip"><i style={{background: STATUS_FILL.BLOCKED}} />Unavailable</span></>}
    {selectable && <span className="fp-chip"><i style={{background: SELECTED_FILL}} />Your selection</span>}
    {note && <span>{note}</span>}</div>;
}
