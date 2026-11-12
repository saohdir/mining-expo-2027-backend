"use client";
import {useEffect, useState} from "react";
import {useConfirm} from "../components/Confirm";

type Display = "names" | "status";
const OPTIONS: {value: Display; title: string; text: string}[] = [
  {value: "names", title: "Show who booked", text: "Reserved and occupied booths show the company: the exhibitor's name approved for public display, or the company you entered on the booth."},
  {value: "status", title: "Only “Not available”", text: "Booked and blocked booths are shown only as Not available — no company names, no reserved/occupied difference."}
];

/** Owner setting: what the public website and customer portal show on booked booths. */
export default function PublicDisplay({canEdit}: {canEdit: boolean}) {
  const ask = useConfirm();
  const [display, setDisplay] = useState<Display | null>(null), [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  useEffect(() => { fetch("/api/admin/floorplans/public-display", {cache: "no-store"}).then(r => r.ok ? r.json() : null).then(j => j && setDisplay(j.display)).catch(() => {}); }, []);
  const choose = async (next: Display) => {
    if (!canEdit || busy || next === display) return;
    const opt = OPTIONS.find(o => o.value === next)!;
    const ok = await ask({title: "Change the public floor plan display?", tone: "warning", confirmLabel: "Yes, change it", reason: {min: 0, label: "Reason (optional, saved in the audit log)"},
      changes: [`Booked booths on the public floor plan: ${opt.title}.`],
      impact: [next === "names" ? "Company names become visible to everyone on the website and in the customer portal." : "Company names disappear from the public floor plan; visitors only see which booths are not available.",
        "Visible within about a minute (public cache)."]});
    if (!ok) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/admin/floorplans/public-display", {method: "PUT", headers: {"Content-Type": "application/json"}, body: JSON.stringify({display: next, reason: ok.reason || undefined})});
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || "Could not save (" + r.status + ").");
      setDisplay(j.display); setMsg("Saved. The public floor plan now shows: " + opt.title + ".");
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  return <section className="cms-card fp-public-display" aria-labelledby="fp-public-h">
    <h2 id="fp-public-h">Public floor plan display</h2>
    <p className="micro">What visitors and customers see on booked booths. Available booths always show their booth category colour.</p>
    <div className="fp-display-options" role="radiogroup" aria-label="Booked booths on the public floor plan">
      {OPTIONS.map(o => <button key={o.value} type="button" role="radio" aria-checked={display === o.value} className="ghost fp-display-option" disabled={!canEdit || busy || display === null} onClick={() => void choose(o.value)}>
        <strong>{o.title}</strong><span>{o.text}</span></button>)}
    </div>
    {!canEdit && <p className="micro">Only Super Admin and Operations can change this.</p>}
    {msg && <p role="status" className="notice">{msg}</p>}
  </section>;
}
