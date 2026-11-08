/** FR-113 (P2): import booth units from a CAD/Illustrator SVG whose booth rectangles carry element IDs
 * (e.g. id="booth-A12"). Pure function: geometry is scaled from the SVG viewBox to the floorplan canvas;
 * metres come from the drawing scale (SVG units per metre). Anything ambiguous is reported, never guessed. */
export type SvgUnit = {code: string; x: number; y: number; w: number; h: number; lengthM: number; widthM: number; category: string | null; hall: string | null};
const attr = (tag: string, name: string) => { const m = tag.match(new RegExp("\\s" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", "i")); return m ? (m[2] ?? m[3]) : null; };
const num = (v: string | null) => { if (v === null) return NaN; const m = v.trim().match(/^(-?\d+(\.\d+)?)(px)?$/); return m ? Number(m[1]) : NaN; };

export function parseSvgUnits(svg: string, opts: {canvasWidth: number; canvasHeight: number; unitsPerMetre: number; idPattern?: RegExp}) {
  const pattern = opts.idPattern ?? /^(?:booth|unit|stand)[-_:]?([A-Za-z0-9][A-Za-z0-9-]{0,29})$/i;
  const warnings: string[] = [], units: SvgUnit[] = [], seen = new Set<string>();
  const root = svg.match(/<svg\b[^>]*>/i)?.[0];
  if (!root) return {units, warnings: ["Not an SVG document."]};
  const vb = (attr(root, "viewBox") || "").trim().split(/[\s,]+/).map(Number);
  const [vx, vy, vw, vh] = vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0 ? vb : [0, 0, num(attr(root, "width")), num(attr(root, "height"))];
  if (!(vw > 0 && vh > 0)) return {units, warnings: ["SVG needs a viewBox or numeric width/height."]};
  if (!(opts.unitsPerMetre > 0)) return {units, warnings: ["Drawing scale (SVG units per metre) must be positive."]};
  const sx = opts.canvasWidth / vw, sy = opts.canvasHeight / vh;
  if (/<g\b[^>]*\stransform\s*=/i.test(svg)) warnings.push("Groups with transform attributes found; rectangles inside them may be misplaced — flatten transforms before export.");
  for (const tag of svg.match(/<(rect|path|polygon|polyline|circle|ellipse)\b[^>]*>/gi) || []) {
    const id = attr(tag, "id"); if (!id) continue;
    const m = id.match(pattern); if (!m) continue;
    const code = m[1].toUpperCase();
    if (!/^<rect\b/i.test(tag)) { warnings.push(`${id}: only <rect> booths can be imported (convert shapes to rectangles).`); continue; }
    if (attr(tag, "transform")) { warnings.push(`${id}: transformed rectangle skipped (flatten transforms).`); continue; }
    if (seen.has(code)) { warnings.push(`${id}: duplicate booth code ${code} skipped.`); continue; }
    const x = num(attr(tag, "x") ?? "0"), y = num(attr(tag, "y") ?? "0"), w = num(attr(tag, "width")), h = num(attr(tag, "height"));
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) { warnings.push(`${id}: missing or non-numeric geometry.`); continue; }
    seen.add(code);
    const r1 = (n: number) => Math.round(n * 10) / 10;
    units.push({code, x: r1((x - vx) * sx), y: r1((y - vy) * sy), w: r1(w * sx), h: r1(h * sy), lengthM: r1(w / opts.unitsPerMetre), widthM: r1(h / opts.unitsPerMetre),
      category: (attr(tag, "data-category") || "").slice(0, 60) || null, hall: (attr(tag, "data-hall") || "").slice(0, 60) || null});
  }
  if (!units.length) warnings.push("No booth rectangles found. Give each booth <rect> an id like booth-A12.");
  return {units, warnings};
}
