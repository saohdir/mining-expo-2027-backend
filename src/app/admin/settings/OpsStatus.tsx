"use client";
import {useCallback, useEffect, useState} from "react";
type Ops = {ok: boolean; checkedAt: string; worker: {ok: boolean; lastCycleAt: string | null; failingSteps: string[]}; outbox: {pending: number; retrying: number; deadLetters: number; oldestPendingAt: string | null};
  exportsFailed24h: number; financeBacklog: {transfersPendingOver48h: number}; retentionLastRun: string | null; alerts: string[]};
const wib = (s: string | null) => s ? new Date(s).toLocaleString("en-GB", {timeZone: "Asia/Jakarta"}) + " WIB" : "—";
/** NFR-29: worker heartbeat, notification queue and backlog alerts. */
export function OpsStatus() {
  const [o, setO] = useState<Ops | null>(null), [msg, setMsg] = useState("");
  const load = useCallback(() => fetch("/api/admin/ops", {cache: "no-store"}).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.message); setO(j); }).catch(e => setMsg(e.message)), []);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 60000); return () => clearInterval(t); }, [load]);
  if (!o) return <section className="cms-card"><h2>Operations status</h2><p className="micro">{msg || "Loading…"}</p></section>;
  return <section className="cms-card" aria-live="polite"><h2>Operations status <span className={o.ok ? "status" : "status warning"}>{o.ok ? "All good" : o.alerts.length + " alert(s)"}</span></h2>
    {o.alerts.length > 0 && <ul role="alert">{o.alerts.map(a => <li key={a}>{a}</li>)}</ul>}
    <dl className="cms-stats">
      <div><dt>Worker last cycle</dt><dd>{wib(o.worker.lastCycleAt)}</dd></div>
      <div><dt>Notifications pending / retrying / gave up</dt><dd>{o.outbox.pending} / {o.outbox.retrying} / {o.outbox.deadLetters}</dd></div>
      <div><dt>Failed exports (24 h)</dt><dd>{o.exportsFailed24h}</dd></div>
      <div><dt>Transfers waiting &gt; 48 h</dt><dd>{o.financeBacklog.transfersPendingOver48h}</dd></div>
      <div><dt>Retention last run</dt><dd>{wib(o.retentionLastRun)}</dd></div>
    </dl>
    <p className="micro">Checked {wib(o.checkedAt)}. Uptime monitors can poll <code>/api/health?deep=1</code> (503 when the database or worker is down).</p>
  </section>;
}
