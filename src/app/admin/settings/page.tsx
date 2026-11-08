"use client";
import {useEffect, useState} from "react";

/** Read-only configuration status (no secret values). Changes go through the server environment with owner approval. */
import {OpsStatus} from "./OpsStatus";
export default function SettingsPage() {
  const [s, setS] = useState<Record<string, unknown> | null>(null), [err, setErr] = useState("");
  useEffect(() => { fetch("/api/admin/settings", {cache: "no-store"}).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.message); setS(j); }).catch(e => setErr(e.message)); }, []);
  return <main className="cms-page"><header><p className="eyebrow">SYSTEM</p><h1>Settings status</h1>
    <p>Feature flags, OTP providers and bank details are server configuration. Enabling live registration, invoices or admission requires Product Owner / Finance / Operations / Legal approval (NFR-32).</p></header><OpsStatus/>
    {err && <p role="alert">{err}</p>}
    {s && Object.entries(s).map(([group, v]) => <section key={group} className="cms-card"><h2>{group}</h2>
      {typeof v === "object" && v ? <dl>{Object.entries(v as Record<string, unknown>).map(([k, val]) => <div key={k} className="cms-row-actions"><dt>{k}</dt><dd><strong>{String(val)}</strong></dd></div>)}</dl> : <p>{String(v)}</p>}
    </section>)}
    {s && <section className="cms-card"><h2>OTP channel switches (FR-115)</h2><p className="micro">Turn a channel off immediately (e.g. provider outage or SMS cost incident). A channel can only be used when the server provider is also configured.</p>
      {(["email", "sms"] as const).map(ch => { const on = (s.otpSwitches as Record<string, boolean>)[ch + "OtpSwitch"]; return <div key={ch} className="cms-row-actions"><strong>{ch.toUpperCase()} OTP</strong> <span>{on ? "switch ON" : "switch OFF"}</span>
        <button type="button" className="ghost" onClick={async () => { const reason = window.prompt("Reason for switching " + ch + " OTP " + (on ? "off" : "on")); if (!reason) return;
          const r = await fetch("/api/admin/settings", {method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify({channel: ch, enabled: !on, reason})});
          if (r.ok) setS({...s, otpSwitches: {...(s.otpSwitches as object), [ch + "OtpSwitch"]: !on}}); else setErr((await r.json()).message); }}>{on ? "Switch off" : "Switch on"}</button></div>; })}</section>}
    <p className="micro">Gates and re-entry policy: <a href="/admin/check-in/settings">Gates &amp; Passes</a>. Staff and roles: <a href="/admin/staff">Staff</a>.</p>
  </main>;
}
