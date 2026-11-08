"use client";
import {useEffect, useRef, useState} from "react";

type Mode = "signin" | "register" | "otp" | "password" | "done" | "forgot" | "forgot-sent";
type ApiError = Error & {fields?: Record<string, string>};
async function post(url: string, body: unknown) {
  const r = await fetch(url, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(j.message || (j.issues ? j.issues.map((i: {message: string}) => i.message).join(" · ") : "Something went wrong. Try again.")) as ApiError;
    err.fields = Object.fromEntries((j.issues || []).map((i: {field: string; message: string}) => [i.field, i.message]));
    throw err;
  }
  return j;
}
const RULES = [
  {test: (p: string) => p.length >= 10, label: "At least 10 characters"},
  {test: (p: string) => /[A-Za-z]/.test(p) && /\d/.test(p), label: "Letters and numbers"}
];

export function PasswordFields({value, confirm, onChange, onConfirm, autoFocus}: {value: string; confirm: string; onChange: (v: string) => void; onConfirm: (v: string) => void; autoFocus?: boolean}) {
  const [show, setShow] = useState(false);
  return <>
    <label>Password<input type={show ? "text" : "password"} autoComplete="new-password" required minLength={10} maxLength={128} value={value} onChange={e => onChange(e.target.value)} autoFocus={autoFocus} aria-describedby="pw-rules" /></label>
    <label>Confirm password<input type={show ? "text" : "password"} autoComplete="new-password" required value={confirm} onChange={e => onConfirm(e.target.value)} aria-invalid={confirm.length > 0 && confirm !== value} /></label>
    <label className="consent"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> Show password</label>
    <ul id="pw-rules" className="micro" aria-label="Password requirements">
      {RULES.map(r => <li key={r.label}>{r.test(value) ? "✓" : "○"} {r.label}</li>)}
      <li>{confirm && confirm === value ? "✓" : "○"} Both passwords match</li>
    </ul>
  </>;
}

/** CR-AUTH-01 customer authentication UI: Sign in (email + password), Create account (details → email OTP →
 * create password → done) and Forgot password. OTP is only used to verify the email during registration. */
export function AuthPanel({onSignedIn, registrationOpen}: {onSignedIn: () => void; registrationOpen: boolean}) {
  const initial: Mode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("signup") === "1" ? "register" : "signin";
  const [mode, setMode] = useState<Mode>(initial), [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [terms, setTerms] = useState(false), [privacy, setPrivacy] = useState(false);
  const [password, setPassword] = useState(""), [confirm, setConfirm] = useState(""), [showPw, setShowPw] = useState(false);
  const [challengeId, setChallengeId] = useState(""), [code, setCode] = useState(""), [expiresAt, setExpiresAt] = useState(0), [resendAt, setResendAt] = useState(0), [now, setNow] = useState(Date.now());
  const setupToken = useRef("");
  useEffect(() => { if (mode !== "otp") return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [mode]);
  const go = (m: Mode) => { setMode(m); setMsg(""); setFieldErr({}); };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(""); setFieldErr({});
    try { await fn(); } catch (e) { const err = e as ApiError; setMsg(err.message); setFieldErr(err.fields || {}); } finally { setBusy(false); }
  };
  const returnTo = () => window.location.pathname + window.location.search + window.location.hash;
  const left = Math.max(0, Math.round((expiresAt - now) / 1000)), resendIn = Math.max(0, Math.round((resendAt - now) / 1000));
  const fe = (k: string) => fieldErr[k] ? <span className="field-error" role="alert">{fieldErr[k]}</span> : null;

  return <section className="portal-auth" aria-live="polite">
    <p className="eyebrow">SECURE ACCOUNT</p>
    {mode === "signin" && <>
      <h1>Sign in.</h1><p>One account for exhibition visits, conferences and booth requests.</p>
      <form onSubmit={e => { e.preventDefault(); void run(async () => { const r = await post("/api/auth/login", {email, password, returnTo: returnTo()}); if (r.next && r.next !== returnTo()) window.history.replaceState(null, "", r.next); onSignedIn(); }); }} noValidate>
        <label>Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!fieldErr.email} />{fe("email")}</label>
        <label>Password<input type={showPw ? "text" : "password"} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} aria-invalid={!!fieldErr.password} />{fe("password")}</label>
        <label className="consent"><input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} /> Show password</label>
        <button disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
        <p className="micro"><button type="button" className="link" onClick={() => go("forgot")}>Forgot password?</button> · Registered before passwords were introduced? Use “Forgot password” to set one up.</p>
        {registrationOpen ? <p className="micro">New here? <button type="button" className="link" onClick={() => go("register")}>Create an account</button></p> : <p className="micro">New registrations are not open yet.</p>}
      </form></>}

    {mode === "register" && <>
      <h1>Create account.</h1><p>Step 1 of 3 — your details. We will email you a 6-digit code to verify your address.</p>
      <form onSubmit={e => { e.preventDefault(); void run(async () => {
        const r = await post("/api/auth/register/start", {fullName: name, email, acceptTerms: terms, acceptPrivacy: privacy});
        setChallengeId(r.challengeId); setExpiresAt(Date.now() + r.expiresInSeconds * 1000); setResendAt(Date.now() + r.resendAfterSeconds * 1000); setCode(""); go("otp"); setMsg(r.message); }); }} noValidate>
        <label>Full name<input autoComplete="name" required minLength={2} value={name} onChange={e => setName(e.target.value)} aria-invalid={!!fieldErr.fullName} />{fe("fullName")}</label>
        <label>Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!fieldErr.email} />{fe("email")}</label>
        <label className="consent"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} /> I accept the <a href="/terms/" target="_blank" rel="noreferrer">Terms &amp; Conditions</a>.</label>{fe("acceptTerms")}
        <label className="consent"><input type="checkbox" checked={privacy} onChange={e => setPrivacy(e.target.checked)} /> I accept the <a href="/privacy/" target="_blank" rel="noreferrer">Privacy Policy</a>.</label>{fe("acceptPrivacy")}
        <button disabled={busy} type="submit">{busy ? "Sending…" : "Create account & send code"}</button>
        <p className="micro">Already have an account? <button type="button" className="link" onClick={() => go("signin")}>Sign in</button></p>
      </form></>}

    {mode === "otp" && <>
      <h1>Verify your email.</h1><p>Step 2 of 3 — enter the 6-digit code sent to <strong>{email}</strong>.</p>
      <form onSubmit={e => { e.preventDefault(); void run(async () => { const r = await post("/api/auth/register/verify", {challengeId, code}); setupToken.current = r.setupToken; setPassword(""); setConfirm(""); go("password"); }); }}>
        <label>Verification code<input value={code} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required onChange={e => setCode(e.target.value.replace(/\D/g, ""))} aria-describedby="otp-timer" /></label>
        <p id="otp-timer" className="micro" role="timer">{left > 0 ? `Code expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "This code has expired — request a new one."}</p>
        <button disabled={busy || code.length !== 6} type="submit">{busy ? "Verifying…" : "Verify code"}</button>
        <div className="cms-row-actions">
          <button type="button" className="ghost" disabled={busy || resendIn > 0} onClick={() => void run(async () => { const r = await post("/api/auth/register/resend", {challengeId}); setChallengeId(r.challengeId); setExpiresAt(Date.now() + r.expiresInSeconds * 1000); setResendAt(Date.now() + r.resendAfterSeconds * 1000); setMsg("A new code was sent."); })}>{resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}</button>
          <button type="button" className="ghost" onClick={() => go("register")}>Change email address</button>
        </div>
      </form></>}

    {mode === "password" && <>
      <h1>Create your password.</h1><p>Step 3 of 3 — your email is verified. Choose a password for signing in.</p>
      <form onSubmit={e => { e.preventDefault(); void run(async () => { await post("/api/auth/password/set", {token: setupToken.current, password, confirmPassword: confirm}); setupToken.current = ""; go("done"); }); }}>
        <PasswordFields value={password} confirm={confirm} onChange={setPassword} onConfirm={setConfirm} autoFocus />
        <button disabled={busy || password !== confirm || password.length < 10} type="submit">{busy ? "Saving…" : "Create password"}</button>
      </form></>}

    {mode === "done" && <><h1>Account ready.</h1><p>Your email is verified and your password is set. You are signed in.</p><button type="button" onClick={onSignedIn}>Go to my dashboard</button></>}

    {mode === "forgot" && <>
      <h1>Forgot password.</h1><p>Enter your email. If an account exists, we will send a link to set a new password (also used once by accounts created before passwords).</p>
      <form onSubmit={e => { e.preventDefault(); void run(async () => { const r = await post("/api/auth/password/forgot", {email}); go("forgot-sent"); setMsg(r.message); }); }} noValidate>
        <label>Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!fieldErr.email} />{fe("email")}</label>
        <button disabled={busy} type="submit">{busy ? "Sending…" : "Send reset link"}</button>
        <p className="micro"><button type="button" className="link" onClick={() => go("signin")}>Back to sign in</button></p>
      </form></>}

    {mode === "forgot-sent" && <><h1>Check your email.</h1><p>{msg}</p><button type="button" className="ghost" onClick={() => go("signin")}>Back to sign in</button></>}

    {msg && !["forgot-sent"].includes(mode) && <p role="status" className="micro form-message">{msg}</p>}
  </section>;
}
