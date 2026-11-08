"use client";
import {useEffect, useState} from "react";

/** Read-only configuration status (no secret values). Changes go through the server environment with owner approval. */
export default function SettingsPage() {
  const [s, setS] = useState<Record<string, unknown> | null>(null), [err, setErr] = useState("");
  useEffect(() => { fetch("/api/admin/settings", {cache: "no-store"}).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.message); setS(j); }).catch(e => setErr(e.message)); }, []);
  return <main className="cms-page"><header><p className="eyebrow">SYSTEM</p><h1>Settings status</h1>
    <p>Feature flags, OTP providers and bank details are server configuration. Enabling live registration, invoices or admission requires Product Owner / Finance / Operations / Legal approval (NFR-32).</p></header>
    {err && <p role="alert">{err}</p>}
    {s && Object.entries(s).map(([group, v]) => <section key={group} className="cms-card"><h2>{group}</h2>
      {typeof v === "object" && v ? <dl>{Object.entries(v as Record<string, unknown>).map(([k, val]) => <div key={k} className="cms-row-actions"><dt>{k}</dt><dd><strong>{String(val)}</strong></dd></div>)}</dl> : <p>{String(v)}</p>}
    </section>)}
    <p className="micro">Gates and re-entry policy: <a href="/admin/check-in/settings">Gates &amp; Passes</a>. Staff and roles: <a href="/admin/staff">Staff</a>.</p>
  </main>;
}
