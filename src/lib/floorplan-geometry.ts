import {createHash} from "node:crypto";
import {safeCell} from "./policy";

/** Pure floorplan rules (FR-094/095/097/098/101/111). DB routes re-check inside transactions. */
export type UnitGeom = {code: string; x: number; y: number; w: number; h: number; rotation?: number; placed?: boolean};

/** Footprint after 90/270° rotation swaps width and height around the top-left anchor. */
export function footprint(u: UnitGeom) {
  const turned = u.rotation === 90 || u.rotation === 270;
  return {x: u.x, y: u.y, w: turned ? u.h : u.w, h: turned ? u.w : u.h};
}
export function outOfCanvas(u: UnitGeom, width: number, height: number) {
  if (u.placed === false) return false;
  const f = footprint(u);
  return f.x < 0 || f.y < 0 || f.x + f.w > width || f.y + f.h > height;
}
/** Overlaps are warnings, not blockers (FR-095). */
export function overlapWarnings(units: UnitGeom[]) {
  const placed = units.filter(u => u.placed !== false).map(u => ({code: u.code, ...footprint(u)}));
  const out: string[] = [];
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
    const a = placed[i], b = placed[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push(a.code + " overlaps " + b.code);
  }
  return out;
}
/** Area auto-derived from length × width, one decimal (FR-094). */
export const areaFrom = (lengthM: number, widthM: number) => Math.round(lengthM * widthM * 10) / 10;
export const dimensionLabelOf = (lengthM: number, widthM: number) => `${trim(lengthM)}×${trim(widthM)}`;
const trim = (n: number) => String(Math.round(n * 10) / 10);

/** FR-101: area mismatch between physical units now and the accepted quotation snapshot. */
export function areaMismatch(currentSqm: number, snapshotSqm: number) {
  return Math.abs(Math.round(currentSqm * 10) - Math.round(snapshotSqm * 10)) > 0;
}

// ---- CSV (FR-097) -----------------------------------------------------------
export const CSV_HEADER = ["code", "category", "lengthM", "widthM", "hall"] as const;
export type CsvUnit = {code: string; category: string; lengthM: number; widthM: number; hall: string | null};
function splitCsvLine(line: string) {
  const out: string[] = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur); return out.map(v => v.trim());
}
export function parseUnitsCsv(text: string): {units: CsvUnit[]; errors: string[]} {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
  const errors: string[] = [], units: CsvUnit[] = [];
  if (!lines.length) return {units, errors: ["CSV is empty"]};
  const head = splitCsvLine(lines[0]).map(h => h.replace(/^'/, ""));
  if (CSV_HEADER.some((h, i) => head[i] !== h)) return {units, errors: ["Header must be: " + CSV_HEADER.join(",")]};
  if (lines.length > 501) return {units, errors: ["At most 500 units per import"]};
  const seen = new Set<string>();
  lines.slice(1).forEach((line, i) => {
    const [code, category, l, w, hall] = splitCsvLine(line).map(v => v.replace(/^'/, ""));
    const row = i + 2, lengthM = Number(l), widthM = Number(w);
    if (!/^[A-Za-z0-9_-]{1,25}$/.test(code || "")) return void errors.push(`Row ${row}: invalid code`);
    if (seen.has(code.toUpperCase())) return void errors.push(`Row ${row}: duplicate code ${code}`);
    if (!category || category.length > 60) return void errors.push(`Row ${row}: category required`);
    if (!(lengthM > 0 && lengthM <= 200 && widthM > 0 && widthM <= 200)) return void errors.push(`Row ${row}: lengthM/widthM must be 0–200`);
    seen.add(code.toUpperCase());
    units.push({code, category, lengthM: Math.round(lengthM * 10) / 10, widthM: Math.round(widthM * 10) / 10, hall: hall ? hall.slice(0, 60) : null});
  });
  return {units, errors};
}
export function unitsToCsv(units: {code: string; category: string; lengthM?: unknown; widthM?: unknown; hall?: string | null}[]) {
  const esc = (v: unknown) => { const s = safeCell(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [CSV_HEADER.join(","), ...units.map(u => [u.code, u.category, u.lengthM ?? "", u.widthM ?? "", u.hall ?? ""].map(esc).join(","))].join("\r\n") + "\r\n";
}

// ---- Remap report (FR-098, AT-081) -----------------------------------------
export type Commitment = {unitCode: string; kind: "ASSIGNMENT" | "HOLD" | "PREFERENCE" | "OFFER"; requestId: string};
export type RemapRow = {code: string; status: "MATCHED" | "UNMATCHED" | "NEW"; oldAreaSqm?: number; newAreaSqm?: number; areaChanged?: boolean; commitments: Commitment[]};
export function remapReport(published: {code: string; areaSqm: number}[], draft: {code: string; areaSqm: number}[], commitments: Commitment[]) {
  const d = new Map(draft.map(u => [u.code.toUpperCase(), u]));
  const p = new Set(published.map(u => u.code.toUpperCase()));
  const rows: RemapRow[] = published.map(u => {
    const m = d.get(u.code.toUpperCase());
    const c = commitments.filter(x => x.unitCode.toUpperCase() === u.code.toUpperCase());
    return m ? {code: u.code, status: "MATCHED", oldAreaSqm: u.areaSqm, newAreaSqm: m.areaSqm, areaChanged: areaMismatch(u.areaSqm, m.areaSqm), commitments: c}
      : {code: u.code, status: "UNMATCHED", oldAreaSqm: u.areaSqm, commitments: c};
  });
  for (const u of draft) if (!p.has(u.code.toUpperCase())) rows.push({code: u.code, status: "NEW", newAreaSqm: u.areaSqm, commitments: []});
  const blocking = rows.filter(r => r.status === "UNMATCHED" && r.commitments.some(c => c.kind === "ASSIGNMENT" || c.kind === "HOLD"));
  const areaWarnings = rows.filter(r => r.areaChanged && r.commitments.length);
  const hash = createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 32);
  return {rows, blocking: blocking.map(r => r.code), areaWarnings: areaWarnings.map(r => r.code), hash,
    summary: {matched: rows.filter(r => r.status === "MATCHED").length, unmatched: rows.filter(r => r.status === "UNMATCHED").length, added: rows.filter(r => r.status === "NEW").length,
      committedUnits: rows.filter(r => r.commitments.length).length}};
}

// ---- Stats (FR-111) ---------------------------------------------------------
export function floorplanStats(units: {status: string; category: string; areaSqm: number}[]) {
  const by = (k: (u: typeof units[number]) => string) => units.reduce<Record<string, {units: number; areaSqm: number}>>((m, u) => {
    const key = k(u); m[key] ??= {units: 0, areaSqm: 0}; m[key].units++; m[key].areaSqm = Math.round((m[key].areaSqm + u.areaSqm) * 10) / 10; return m; }, {});
  const total = Math.round(units.reduce((a, u) => a + u.areaSqm, 0) * 10) / 10;
  const occupied = Math.round(units.filter(u => u.status === "OCCUPIED").reduce((a, u) => a + u.areaSqm, 0) * 10) / 10;
  return {totalUnits: units.length, totalAreaSqm: total, occupiedAreaSqm: occupied, occupiedPercent: total ? Math.round(occupied / total * 1000) / 10 : 0,
    byStatus: by(u => u.status), byCategory: by(u => u.category)};
}
