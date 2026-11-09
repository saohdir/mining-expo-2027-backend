"use client";
import {useEffect, useState} from "react";

export type Participant = {email: string | null; phone?: string | null; verifiedPhoneAt?: string | null;
  profile: {salutation?: string | null; fullName: string; jobTitle?: string | null; organization?: string | null} | null};
async function send(path: string, method: string, body: unknown) {
  const r = await fetch(path, {method, cache: "no-store", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.issues?.map((i: {message: string}) => i.message).join(", ") || "Request failed");
  return j;
}
export const participantComplete = (p: Participant) => Boolean(p.profile?.salutation && p.profile.fullName?.trim() && p.profile.jobTitle?.trim() && p.profile.organization?.trim() && p.email && p.phone && p.verifiedPhoneAt);
const SAL: Record<string, string> = {BAPAK: "Bapak (Mr.)", IBU: "Ibu (Ms./Mrs.)"};

/** WhatsApp number verification by a one-time code sent via SMS or WhatsApp (whichever the organizer enabled). */
export function WhatsAppVerify({p, label = "WhatsApp number", onVerified}: {p: Participant; label?: string; onVerified: () => void}) {
  const [channels, setChannels] = useState<{sms: boolean; wa: boolean}>({sms: false, wa: false});
  const [num, setNum] = useState(""), [ch, setCh] = useState<"SMS" | "WHATSAPP">("WHATSAPP"), [challenge, setChallenge] = useState(""), [code, setCode] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!p.verifiedPhoneAt);
  useEffect(() => { fetch("/api/public/capabilities", {cache: "no-store"}).then(r => r.json()).then(c => { setChannels({sms: !!c.smsOtp, wa: !!c.whatsappOtp}); if (!c.whatsappOtp && c.smsOtp) setCh("SMS"); }).catch(() => {}); }, []);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setMsg(""); try { await fn(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } };
  if (!editing && p.phone && p.verifiedPhoneAt) return <div className="record"><div><strong>{label}</strong><span className="micro"> {p.phone} · verified ✓</span></div><button type="button" className="ghost" onClick={() => setEditing(true)}>Change</button></div>;
  const none = !channels.sms && !channels.wa;
  return <fieldset className="whatsapp-verify"><legend>{label} (verified by a one-time code)</legend>
    {!challenge ? <>
      <label>Number<input inputMode="tel" autoComplete="tel" placeholder="0812 3456 7890" value={num} onChange={e => setNum(e.target.value)} /></label>
      <div className="cms-row-actions" role="radiogroup" aria-label="Send the code via">
        {channels.wa && <label className="consent"><input type="radio" name="otp-ch" checked={ch === "WHATSAPP"} onChange={() => setCh("WHATSAPP")} /> WhatsApp</label>}
        {channels.sms && <label className="consent"><input type="radio" name="otp-ch" checked={ch === "SMS"} onChange={() => setCh("SMS")} /> SMS</label>}
      </div>
      <button type="button" disabled={busy || none || num.replace(/\D/g, "").length < 9} onClick={() => void run(async () => { const j = await send("/api/customer/contact-change", "POST", {channel: ch, value: num}); setChallenge(j.challengeId); setMsg("Enter the 6-digit code we sent via " + (ch === "SMS" ? "SMS" : "WhatsApp") + "."); })}>Send code</button>
      {none && <p className="micro" role="status">Phone verification is not available yet. Contact the organizer.</p>}
    </> : <>
      <label>6-digit code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} /></label>
      <div className="cms-row-actions"><button type="button" disabled={busy || code.length !== 6} onClick={() => void run(async () => { await send("/api/customer/contact-change/verify", "POST", {challengeId: challenge, code}); setChallenge(""); setCode(""); setEditing(false); onVerified(); })}>Verify</button>
        <button type="button" className="ghost" onClick={() => { setChallenge(""); setCode(""); }}>Use another number</button></div>
    </>}
    {msg && <p className="micro" role="status">{msg}</p>}
  </fieldset>;
}

/** Visitor / conference participant details: salutation, full name, job, company, sign-up email, verified WhatsApp. One person per account. */
export function ParticipantDetails({p, onSaved, intro}: {p: Participant; onSaved: () => void; intro: string}) {
  const [f, setF] = useState({salutation: p.profile?.salutation || "", fullName: p.profile?.fullName || "", jobTitle: p.profile?.jobTitle || "", organization: p.profile?.organization || ""});
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const saved = p.profile?.salutation === f.salutation && p.profile?.fullName === f.fullName && (p.profile?.jobTitle || "") === f.jobTitle && (p.profile?.organization || "") === f.organization;
  return <div className="participant-details" data-testid="participant-details">
    <h3>Participant details</h3><p className="micro">{intro} One account registers one person.</p>
    <form className="form-grid" onSubmit={e => { e.preventDefault(); setBusy(true); setMsg(""); send("/api/customer/me", "PATCH", f).then(() => { setMsg("Details saved."); onSaved(); }).catch(err => setMsg((err as Error).message)).finally(() => setBusy(false)); }}>
      <label>Salutation<select required value={f.salutation} onChange={e => setF({...f, salutation: e.target.value})}><option value="">Choose…</option>{Object.entries(SAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Full name<input required minLength={2} maxLength={120} autoComplete="name" value={f.fullName} onChange={e => setF({...f, fullName: e.target.value})} /></label>
      <label>Job title / occupation<input required maxLength={120} autoComplete="organization-title" value={f.jobTitle} onChange={e => setF({...f, jobTitle: e.target.value})} /></label>
      <label>Company<input required maxLength={180} autoComplete="organization" value={f.organization} onChange={e => setF({...f, organization: e.target.value})} /></label>
      <label>Email (from your sign-up)<input value={p.email || ""} readOnly aria-readonly="true" /></label>
      <div><button disabled={busy || saved}>{saved ? "Saved ✓" : "Save details"}</button></div>
    </form>
    <WhatsAppVerify p={p} onVerified={onSaved} />
    {msg && <p className="micro" role="status">{msg}</p>}
  </div>;
}
