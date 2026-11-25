"use client";
import {useEffect, useState} from "react";

export type PassView = {passId: string; qrDataUrl: string; entitlement: string; manualCode: string; kind?: "EXHIBITION" | "CONFERENCE"; label?: string;
  programmeStartsAt?: string | null; fileName?: string; holder?: string | null; event?: {title: string; startsAt: string; endsAt: string; venue: string}};

const TZ = "Asia/Jakarta";
const dayMonthYear = (d: Date) => d.toLocaleDateString("en-GB", {timeZone: TZ, day: "numeric", month: "short", year: "numeric"});
/** Exhibition: "26–28 May 2027" (whole event); conference: "Thu, 27 May 2027 · 18:30 WIB" (session start). */
export function passWhen(p: PassView) {
  if (p.kind === "CONFERENCE") {
    if (!p.programmeStartsAt) return "Date to be announced";
    const d = new Date(p.programmeStartsAt);
    return d.toLocaleDateString("en-GB", {timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric"}) + " · " +
      d.toLocaleTimeString("en-GB", {timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false}) + " WIB";
  }
  if (!p.event) return "";
  const a = new Date(p.event.startsAt), b = new Date(p.event.endsAt);
  const da = a.toLocaleDateString("en-GB", {timeZone: TZ, day: "numeric"}), rest = dayMonthYear(b);
  return da === b.toLocaleDateString("en-GB", {timeZone: TZ, day: "numeric"}) ? rest : da + "–" + rest;
}

/** One personal QR pass: what it is for (full programme name), when and where, the holder, the QR and the manual code.
 * "Print pass" prints only this card. The access zone is shown small for gate staff. */
export function PassCard({p}: {p: PassView}) {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    document.body.classList.add("print-one-pass");
    const done = () => { document.body.classList.remove("print-one-pass"); setPrinting(false); };
    window.addEventListener("afterprint", done, {once: true});
    const t = setTimeout(() => window.print(), 30);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", done); document.body.classList.remove("print-one-pass"); };
  }, [printing]);
  const label = p.label || (p.entitlement === "EXPO_ENTRY" ? "Exhibition entry" : "Conference programme");
  const conference = (p.kind || (p.entitlement === "EXPO_ENTRY" ? "EXHIBITION" : "CONFERENCE")) === "CONFERENCE";
  return <figure className={"pass printable-pass" + (printing ? " print-target" : "")} aria-label={(conference ? "Conference pass: " : "Exhibition pass: ") + label}>
    <span className="pass-kind">{conference ? "Conference pass" : "Exhibition pass"}</span>
    <h3 className="pass-title">{label}</h3>
    <p className="pass-meta">{passWhen(p)}{p.event?.venue ? <><br/>{p.event.venue}</> : null}</p>
    {p.holder && <p className="pass-holder">{p.holder}</p>}
    <img width={220} height={220} src={p.qrDataUrl} alt={"Personal entry QR pass, " + label}/>
    <figcaption>Private pass · Do not share</figcaption>
    <p className="micro">Manual code for gate staff: <strong style={{letterSpacing: "0.12em"}}>{p.manualCode}</strong></p>
    <p className="micro pass-zone">Access zone: {p.entitlement}</p>
    <div className="cms-row-actions no-print"><a href={p.qrDataUrl} download={p.fileName || "imdx-pass-" + p.passId.slice(0, 8) + ".png"}>Download QR</a>
      <button type="button" onClick={() => setPrinting(true)}>Print pass</button></div>
  </figure>;
}
