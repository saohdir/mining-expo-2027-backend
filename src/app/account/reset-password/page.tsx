"use client";
import {useEffect, useState} from "react";
import {PasswordFields} from "../AuthPanel";

/** CR-AUTH-01 §3/§4: reset password (or one-time setup for accounts created before passwords). */
export default function ResetPasswordPage() {
  const [token, setToken] = useState(""), [state, setState] = useState<"checking" | "invalid" | "form" | "done">("checking"), [purpose, setPurpose] = useState("RESET");
  const [password, setPassword] = useState(""), [confirm, setConfirm] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") || "";
    setToken(t);
    // Remove the secret token from the address bar/history as soon as it is read.
    window.history.replaceState(null, "", "/account/reset-password");
    fetch("/api/auth/password/token?token=" + encodeURIComponent(t), {cache: "no-store"}).then(r => r.json()).then(j => { if (j.valid) { setPurpose(j.purpose); setState("form"); } else setState("invalid"); }).catch(() => setState("invalid"));
  }, []);
  const submit = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/auth/password/set", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({token, password, confirmPassword: confirm})});
      const j = await r.json();
      if (!r.ok) { setMsg(j.message); if (j.error === "TOKEN_INVALID") setState("invalid"); return; }
      setState("done");
    } finally { setBusy(false); }
  };
  return <main className="portal-shell"><section className="portal-auth" aria-live="polite">
    <p className="eyebrow">SECURE ACCOUNT</p>
    {state === "checking" && <p role="status">Checking your link…</p>}
    {state === "invalid" && <><h1>Link expired.</h1><p>This link is invalid, expired or was already used. Request a new one from the sign-in page.</p><a className="button-link" href="/account">Back to sign in</a></>}
    {state === "form" && <><h1>{purpose === "SETUP" ? "Set up your password." : "Choose a new password."}</h1>
      <p>{purpose === "SETUP" ? "Your account was created with email codes. Set a password to sign in from now on — your bookings and invoices stay the same." : "After saving, all devices are signed out. Sign in again with your new password."}</p>
      <form onSubmit={e => { e.preventDefault(); void submit(); }}>
        <PasswordFields value={password} confirm={confirm} onChange={setPassword} onConfirm={setConfirm} autoFocus />
        <button disabled={busy || password !== confirm || password.length < 10} type="submit">{busy ? "Saving…" : "Save password"}</button>
      </form></>}
    {state === "done" && <><h1>Password updated.</h1><p>You can now sign in with your email and new password.</p><a className="button-link" href="/account?signin=1">Sign in</a></>}
    {msg && <p role="alert" className="micro">{msg}</p>}
  </section></main>;
}
