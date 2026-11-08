"use client";
import {useEffect, useState} from "react";
import {AuthPanel} from "../AuthPanel";

type Preview = {kind: string; status: string; email: string; fullName: string; expiresAt: string; company: string | null; event: string | null; programme: string | null};
const KEY = "imdx-invite";
/** FR-156/FR-059: accept an invitation with your own account. The token is moved out of the address bar into
 * this tab's session storage so it survives sign-in/sign-up without leaking via history or referrers. */
export default function InvitationPage() {
  const [token, setToken] = useState(""), [p, setP] = useState<Preview | null>(null), [state, setState] = useState<"checking" | "invalid" | "ready" | "login" | "done">("checking");
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false), [regOpen, setRegOpen] = useState(false);
  useEffect(() => {
    let t = new URLSearchParams(window.location.search).get("token") || "";
    try { if (t) sessionStorage.setItem(KEY, t); else t = sessionStorage.getItem(KEY) || ""; } catch {}
    window.history.replaceState(null, "", "/account/invitation");
    setToken(t);
    fetch("/api/health", {cache: "no-store"}).then(r => r.json()).then(h => setRegOpen(Boolean(h.registrationEnabled))).catch(() => {});
    if (!t) { setState("invalid"); return; }
    fetch("/api/public/invitations?token=" + encodeURIComponent(t), {cache: "no-store"}).then(async r => { if (!r.ok) throw 0; setP(await r.json()); setState("ready"); }).catch(() => setState("invalid"));
  }, []);
  const accept = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/customer/invitations/accept", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({token})});
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) { setState("login"); return; }
      if (!r.ok) { setMsg(j.message || "Could not accept the invitation."); return; }
      try { sessionStorage.removeItem(KEY); } catch {}
      setState("done");
    } finally { setBusy(false); }
  };
  const staff = p?.kind === "EXHIBITOR_STAFF", prereg = p?.kind === "PREREGISTERED_VISITOR";
  return <main className="portal-shell"><section className="portal-auth" aria-live="polite">
    <p className="eyebrow">IMDX 2027 INVITATION</p>
    {state === "checking" && <p role="status">Checking your invitation…</p>}
    {state === "invalid" && <><h1>Invitation not found.</h1><p>This link is invalid. Ask the person who invited you to send a new invitation.</p><a className="button-link" href="/account">Go to my account</a></>}
    {(state === "ready" || state === "login") && p && <>
      <h1>{staff ? "Booth representative" : prereg ? "You are pre-registered" : "Conference delegate"}</h1>
      <p>{prereg ? <>The organizer pre-registered <strong>{p.fullName}</strong> as a visitor of {p.event || "IMDX 2027"}. Accept to receive your personal expo entry QR pass.</> : staff ? <>{p.company || "An exhibitor"} invited <strong>{p.fullName}</strong> to represent their booth at IMDX 2027. You will receive your own expo entry QR pass.</>
        : <><strong>{p.fullName}</strong> was registered as a delegate for <strong>{p.programme}</strong>. Your seat is confirmed by the organizer after review and payment.</>}</p>
      <p className="micro">Invitation for {p.email} · valid until {new Date(p.expiresAt).toLocaleString("en-GB", {timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short"})} WIB · status {p.status}</p>
      {p.status !== "INVITED" ? <p role="alert">This invitation is {p.status.toLowerCase()} and can no longer be accepted.</p>
        : state === "login" ? <><p role="alert">Sign in, or create your account, with the invited email address ({p.email}).</p><AuthPanel registrationOpen={regOpen} onSignedIn={() => { setState("ready"); void accept(); }} /></>
        : <button disabled={busy} onClick={() => void accept()}>{busy ? "Accepting…" : "Accept invitation"}</button>}
    </>}
    {state === "done" && <><h1>Invitation accepted.</h1><p>{staff || prereg ? "Your expo QR pass is in your account." : "Your registration is waiting for organizer confirmation."}</p><a className="button-link" href="/account">Open my account</a></>}
    {msg && <p role="alert" className="micro">{msg}</p>}
  </section></main>;
}
