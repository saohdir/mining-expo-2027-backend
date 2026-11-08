"use client";
import {useEffect, useState} from "react";
type Est = {category: string; pricedSqm: number; estimateMinor: string; perSqmMinor: string; minimumApplied: boolean; package: {name: string; priceMinor: string; maxSqm: number; includes: string} | null; taxNote: string; disclaimer: string};
const idr = (m: string) => "IDR " + Number(m).toLocaleString("id-ID");
/** FR-159: indicative fee for the requested area; never part of the request and never a commitment. */
export function FeeEstimate({area}: {area: string}) {
  const [cats, setCats] = useState<string[]>([]), [cat, setCat] = useState(""), [est, setEst] = useState<Est | null>(null);
  useEffect(() => { fetch("/api/public/estimate", {cache: "no-store"}).then(r => r.ok ? r.json() : null).then(j => { if (j) { setCats(j.categories.map((c: {name: string}) => c.name)); setCat(j.categories[0]?.name || ""); } }).catch(() => {}); }, []);
  useEffect(() => {
    const a = Number(area); if (!cat || !(a >= 1)) { setEst(null); return; }
    const t = setTimeout(() => { fetch("/api/public/estimate?area=" + a + "&category=" + encodeURIComponent(cat), {cache: "no-store"}).then(r => r.ok ? r.json() : null).then(setEst).catch(() => setEst(null)); }, 250);
    return () => clearTimeout(t);
  }, [area, cat]);
  if (!cats.length) return null;
  return <div className="fee-estimate" role="note" aria-live="polite" data-testid="fee-estimate">
    <label>Estimate category<select value={cat} onChange={e => setCat(e.target.value)}>{cats.map(c => <option key={c}>{c}</option>)}</select></label>
    {est && <p><strong>Estimated {idr(est.estimateMinor)}</strong> for {est.pricedSqm} m² × {idr(est.perSqmMinor)}/m²{est.minimumApplied ? " (category minimum area applied)" : ""}.
      {est.package && <> Package alternative: {est.package.name} (up to {est.package.maxSqm} m²) {idr(est.package.priceMinor)}{est.package.includes ? " — " + est.package.includes : ""}.</>}</p>}
    {est && <p className="micro">{est.taxNote} {est.disclaimer}</p>}
  </div>;
}
