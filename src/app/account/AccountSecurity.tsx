"use client";
import {useEffect, useState} from "react";

const post = async (url: string, body: unknown) => {
  const r = await fetch(url, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.message || "Request failed");
  return b;
};
const wib = (d: string) => new Date(d).toLocaleString("en-GB", {timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short"}) + " WIB";

/** FR-116 contact change with OTP to the new target; FR-118/143 customer-safe activity timeline. */
export function AccountSecurity({smsAvailable, onChanged}: {smsAvailable: boolean; onChanged: () => void}) {
  const [channel, setChannel] = useState<"EMAIL" | "SMS">("EMAIL"), [value, setValue] = useState(""), [challenge, setChallenge] = useState(""), [code, setCode] = useState("");
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false), [events, setEvents] = useState<{label: string; kind: string; reference: string; at: string}[]>([]);
  useEffect(() => { fetch("/api/customer/timeline", {cache: "no-store"}).then(r => r.ok ? r.json() : {events: []}).then(b => setEvents(b.events || [])).catch(() => {}); }, [busy]);
  const act = async (fn: () => Promise<void>) => { setBusy(true); setMsg(""); try { await fn(); } catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); } };
  return <>
    <section aria-labelledby="contact-change"><h3 id="contact-change">Change sign-in email or phone</h3>
      <p className="micro">For security you must have signed in within the last 15 minutes. A code is sent to the NEW contact; other devices are signed out after the change.</p>
      {!challenge ? <form className="form-grid" onSubmit={e => { e.preventDefault(); void act(async () => { const b = await post("/api/customer/contact-change", {channel, value}); setChallenge(b.challengeId); setMsg(b.message); }); }}>
        <label>Channel<select value={channel} onChange={e => setChannel(e.target.value as "EMAIL" | "SMS")}><option value="EMAIL">Email</option><option value="SMS" disabled={!smsAvailable}>Mobile (SMS){smsAvailable ? "" : " — not configured"}</option></select></label>
        <label>{channel === "EMAIL" ? "New email address" : "New mobile number (+62…)"}<input required type={channel === "EMAIL" ? "email" : "tel"} value={value} onChange={e => setValue(e.target.value)} /></label>
        <button disabled={busy}>Send code to new contact</button></form>
        : <form className="form-grid" onSubmit={e => { e.preventDefault(); void act(async () => { const b = await post("/api/customer/contact-change/verify", {challengeId: challenge, code}); setChallenge(""); setCode(""); setValue(""); setMsg("Contact updated. Other devices signed out: " + b.otherSessionsRevoked + "."); onChanged(); }); }}>
          <label>6-digit code<input required pattern="[0-9]{6}" inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} /></label>
          <button disabled={busy}>Confirm change</button><button type="button" className="ghost" onClick={() => setChallenge("")}>Cancel</button></form>}
      {msg && <p role="status" className="micro">{msg}</p>}
    </section>
    <section aria-labelledby="activity"><h3 id="activity">Account activity</h3>
      {events.length ? <ol className="micro timeline">{events.slice(0, 50).map((e, i) => <li key={i}><time dateTime={e.at}>{wib(e.at)}</time> — {e.label} <span className="muted">({e.kind} {e.reference})</span></li>)}</ol> : <p className="micro">No activity yet.</p>}
    </section>
  </>;
}
