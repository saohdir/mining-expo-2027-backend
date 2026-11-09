/** Pure geometry for splitting / merging booth units on a live floor (owner request, Nov 2026).
 * A split keeps the original booth (same id and code, its bookings stay) with the chosen area and
 * creates the remainder as a new booth next to it. Cut runs across the longer side. */
export type Box = {x: number; y: number; w: number; h: number; areaSqm: number; lengthM: number | null; widthM: number | null};
const r1 = (n: number) => Math.round(n * 10) / 10;

export function splitBox(u: Box, keepArea: number): {keep: Box; rest: Box} {
  if (!(keepArea > 0) || keepArea >= u.areaSqm) throw new Error("Area to keep must be more than 0 and less than " + u.areaSqm + " m².");
  const restArea = r1(u.areaSqm - keepArea), keep = r1(keepArea);
  if (keep < 1 || restArea < 1) throw new Error("Both parts must be at least 1 m².");
  const f = keep / u.areaSqm;
  // Metres: scale the longer side, the shorter side stays.
  const dims = (share: number) => {
    if (!u.lengthM || !u.widthM) return {lengthM: null, widthM: null};
    return u.lengthM >= u.widthM ? {lengthM: r1(u.lengthM * share), widthM: u.widthM} : {lengthM: u.lengthM, widthM: r1(u.widthM * share)};
  };
  if (u.w >= u.h) {
    const w1 = Math.max(1, Math.round(u.w * f));
    return {keep: {...u, w: w1, areaSqm: keep, ...dims(f)}, rest: {...u, x: u.x + w1, w: u.w - w1, areaSqm: restArea, ...dims(1 - f)}};
  }
  const h1 = Math.max(1, Math.round(u.h * f));
  return {keep: {...u, h: h1, areaSqm: keep, ...dims(f)}, rest: {...u, y: u.y + h1, h: u.h - h1, areaSqm: restArea, ...dims(1 - f)}};
}

/** Merge two booths back into one (bounding box, areas added). */
export function mergeBoxes(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  const sameRow = a.y === b.y && a.h === b.h, sameCol = a.x === b.x && a.w === b.w;
  const sum = (p: number | null, q: number | null) => p != null && q != null ? r1(p + q) : null;
  const dims = !a.lengthM || !a.widthM || !b.lengthM || !b.widthM ? {lengthM: null, widthM: null}
    : a.widthM === b.widthM ? {lengthM: sum(a.lengthM, b.lengthM), widthM: a.widthM}
    : a.lengthM === b.lengthM ? {lengthM: a.lengthM, widthM: sum(a.widthM, b.widthM)} : {lengthM: null, widthM: null};
  return {x, y, w: sameCol ? a.w : Math.max(a.x + a.w, b.x + b.w) - x, h: sameRow ? a.h : Math.max(a.y + a.h, b.y + b.h) - y, areaSqm: r1(a.areaSqm + b.areaSqm), ...dims};
}

/** Next free code for the remainder: A01 → A01-B, A01-C … (max 25 chars). */
export function nextSplitCode(code: string, taken: Set<string>): string {
  const base = code.replace(/-[B-Z]$/i, "");
  for (const s of "BCDEFGHIJKLMNOPQRSTUVWXYZ") { const c = (base.slice(0, 23) + "-" + s); if (!taken.has(c.toUpperCase())) return c; }
  throw new Error("No free booth code left for this split.");
}
