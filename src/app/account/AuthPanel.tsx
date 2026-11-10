"use client";
import {useEffect, useId, useRef, useState, type ReactNode} from "react";
import "./auth.css";

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

/* ---------- presentation helpers (no behaviour) ---------- */
const PATHS: Record<string, string> = {
  mail: "M4 6h16v12H4zM4 7l8 6 8-6", user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0", lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  key: "M7 14a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM10 11h10M17 11v3M20 11v2", eye: "M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.3 3.9M6.6 6.6C3.8 8.4 2 12 2 12s3.6 6.5 10 6.5c1.6 0 3-.4 4.3-1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  arrow: "M5 12h14M13 6l6 6-6 6", check: "M5 12.5l4.5 4.5L19 7.5", alert: "M12 8v5M12 16.5v.5M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z", send: "M4 12l16-8-6 16-2.5-6.5L4 12z"
};
const Icon = ({name, size = 18}: {name: string; size?: number}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={PATHS[name]} /></svg>;
const Arrow = () => <span className="imdx-auth-arrow"><Icon name="arrow" size={18} /></span>;

/** Label above, input with a leading icon; trailing control (e.g. show-password) sits outside the <label> so the accessible name stays the label text. */
function Field({label, icon, error, hint, trailing, children}: {label: string; icon: string; error?: string; hint?: ReactNode; trailing?: ReactNode; children: (id: string, describedBy?: string) => ReactNode}) {
  const id = useId(), errId = id + "-err", hintId = id + "-hint";
  const describedBy = [error ? errId : "", hint ? hintId : ""].filter(Boolean).join(" ") || undefined;
  return <div className={"imdx-auth-field" + (error ? " has-error" : "")}>
    <label htmlFor={id}>{label}</label>
    <div className={"imdx-auth-input" + (trailing ? " has-trailing" : "")}><span className="imdx-auth-lead"><Icon name={icon} /></span>{children(id, describedBy)}{trailing}</div>
    {hint && <div id={hintId} className="imdx-auth-hint">{hint}</div>}
    {error && <span id={errId} className="field-error" role="alert"><Icon name="alert" size={14} />{error}</span>}
  </div>;
}
function EyeToggle({show, onToggle, controls}: {show: boolean; onToggle: () => void; controls: string}) {
  return <button type="button" className="portal-plain imdx-auth-eye" aria-pressed={show} aria-controls={controls} aria-label={show ? "Hide password" : "Show password"} onClick={onToggle}><Icon name={show ? "eyeOff" : "eye"} /></button>;
}

export function PasswordFields({value, confirm, onChange, onConfirm, autoFocus}: {value: string; confirm: string; onChange: (v: string) => void; onConfirm: (v: string) => void; autoFocus?: boolean}) {
  const [show, setShow] = useState(false);
  const ids = useRef({a: "", b: ""});
  const mismatch = confirm.length > 0 && confirm !== value;
  return <>
    <Field label="Password" icon="lock" trailing={<EyeToggle show={show} onToggle={() => setShow(v => !v)} controls={ids.current.a + " " + ids.current.b} />}
      hint={<ul id="pw-rules" className="imdx-auth-rules" aria-label="Password requirements">
        {RULES.map(r => <li key={r.label} className={r.test(value) ? "ok" : ""}><Icon name={r.test(value) ? "check" : "lock"} size={13} />{r.label}</li>)}
        <li className={confirm && confirm === value ? "ok" : ""}><Icon name={confirm && confirm === value ? "check" : "lock"} size={13} />Both passwords match</li></ul>}>
      {(id, d) => { ids.current.a = id; return <input id={id} type={show ? "text" : "password"} autoComplete="new-password" required minLength={10} maxLength={128} value={value} onChange={e => onChange(e.target.value)} autoFocus={autoFocus} aria-describedby={d} placeholder="At least 10 characters" />; }}
    </Field>
    <Field label="Confirm password" icon="lock" error={mismatch ? "Passwords do not match yet." : undefined}>
      {(id, d) => { ids.current.b = id; return <input id={id} type={show ? "text" : "password"} autoComplete="new-password" required value={confirm} onChange={e => onConfirm(e.target.value)} aria-invalid={mismatch} aria-describedby={d} placeholder="Repeat the password" />; }}
    </Field>
  </>;
}

/** Brand row (logo); the close button belongs to the surrounding modal and sits on the same line. */
export function AuthBrand() {
  return <div className="imdx-auth-brand"><img src="/assets/imd-logo-orange.webp" alt="IMDX — Indonesia Mining & Downstream Industries Exhibition 2027" width="188" height="72" /></div>;
}

/** CR-AUTH-01 customer authentication UI: Sign in (email + password), Create account (details → email OTP →
 * create password → done) and Forgot password. OTP is only used to verify the email during registration. */
export function AuthPanel({onSignedIn, registrationOpen}: {onSignedIn: () => void; registrationOpen: boolean}) {
  const initial: Mode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("signup") === "1" ? "register" : "signin";
  const [mode, setMode] = useState<Mode>(initial), [busy, setBusy] = useState(false), [msg, setMsg] = useState(""), [msgOk, setMsgOk] = useState(false), [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [terms, setTerms] = useState(false), [privacy, setPrivacy] = useState(false);
  const [password, setPassword] = useState(""), [confirm, setConfirm] = useState(""), [showPw, setShowPw] = useState(false);
  const [challengeId, setChallengeId] = useState(""), [code, setCode] = useState(""), [expiresAt, setExpiresAt] = useState(0), [resendAt, setResendAt] = useState(0), [now, setNow] = useState(Date.now());
  const setupToken = useRef("");
  const pwId = useRef("");
  useEffect(() => { if (mode !== "otp") return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [mode]);
  const go = (m: Mode) => { setMode(m); setMsg(""); setMsgOk(false); setFieldErr({}); };
  const info = (m: string) => { setMsg(m); setMsgOk(true); };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(""); setMsgOk(false); setFieldErr({});
    try { await fn(); } catch (e) { const err = e as ApiError; setMsg(err.message); setMsgOk(false); setFieldErr(err.fields || {}); } finally { setBusy(false); }
  };
  const returnTo = () => window.location.pathname + window.location.search + window.location.hash;
  const left = Math.max(0, Math.round((expiresAt - now) / 1000)), resendIn = Math.max(0, Math.round((resendAt - now) / 1000));
  const Submit = ({label, busyLabel, disabled}: {label: string; busyLabel: string; disabled?: boolean}) =>
    <button className="portal-plain imdx-auth-primary" disabled={busy || disabled} type="submit" aria-busy={busy}>{busy ? <><span className="imdx-auth-spinner" aria-hidden="true" />{busyLabel}</> : <>{label}<Arrow /></>}</button>;
  const Head = ({title, children}: {title: string; children?: ReactNode}) => <header className="imdx-auth-head"><p className="eyebrow">SECURE ACCOUNT</p><h1>{title}</h1>{children && <p className="imdx-auth-lede">{children}</p>}</header>;
  const Steps = ({at}: {at: 1 | 2 | 3}) => <ol className="imdx-auth-steps" aria-label={`Step ${at} of 3`}>{[1, 2, 3].map(n => <li key={n} className={n < at ? "done" : n === at ? "now" : ""} aria-current={n === at ? "step" : undefined}><span className="sr-only">Step {n}</span></li>)}</ol>;

  return <section className="portal-auth imdx-auth" aria-live="polite">
    <AuthBrand />
    {mode === "signin" && <>
      <Head title="Sign in.">One account for exhibition visits, conferences and booth requests.</Head>
      <form className="imdx-auth-form" onSubmit={e => { e.preventDefault(); void run(async () => { const r = await post("/api/auth/login", {email, password, returnTo: returnTo()}); if (r.next && r.next !== returnTo()) window.history.replaceState(null, "", r.next); onSignedIn(); }); }} noValidate>
        <Field label="Email address" icon="mail" error={fieldErr.email}>{(id, d) => <input id={id} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!fieldErr.email} aria-describedby={d} placeholder="name@company.com" />}</Field>
        <Field label="Password" icon="lock" error={fieldErr.password} trailing={<EyeToggle show={showPw} onToggle={() => setShowPw(v => !v)} controls={pwId.current} />}>
          {(id, d) => { pwId.current = id; return <input id={id} type={showPw ? "text" : "password"} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} aria-invalid={!!fieldErr.password} aria-describedby={d} placeholder="Your password" />; }}</Field>
        <div className="imdx-auth-row"><button type="button" className="link" onClick={() => go("forgot")}>Forgot password?</button></div>
        {msg && (msgOk || !Object.keys(fieldErr).length) && <FormMessage ok={msgOk}>{msg}</FormMessage>}
        <Submit label="Sign in" busyLabel="Signing in…" />
        <p className="imdx-auth-note">Registered before passwords were introduced? Use “Forgot password” once to set one up.</p>
      </form>
      <footer className="imdx-auth-foot">{registrationOpen ? <>New here? <button type="button" className="link" onClick={() => go("register")}>Create an account</button></> : "New registrations are not open yet."}</footer></>}

    {mode === "register" && <>
      <Head title="Create account."><Steps at={1} />Step 1 of 3 — your details. We will email you a 6-digit code to verify your address.</Head>
      <form className="imdx-auth-form" onSubmit={e => { e.preventDefault(); void run(async () => {
        const r = await post("/api/auth/register/start", {fullName: name, email, acceptTerms: terms, acceptPrivacy: privacy});
        setChallengeId(r.challengeId); setExpiresAt(Date.now() + r.expiresInSeconds * 1000); setResendAt(Date.now() + r.resendAfterSeconds * 1000); setCode(""); go("otp"); info(r.message); }); }} noValidate>
        <Field label="Full name" icon="user" error={fieldErr.fullName}>{(id, d) => <input id={id} autoComplete="name" required minLength={2} value={name} onChange={e => setName(e.target.value)} aria-invalid={!!fieldErr.fullName} aria-describedby={d} placeholder="As it should appear on your pass" />}</Field>
        <Field label="Email address" icon="mail" error={fieldErr.email}>{(id, d) => <input id={id} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!fieldErr.email} aria-describedby={d} placeholder="name@company.com" />}</Field>
        <div className="imdx-auth-checks">
          <label className="imdx-auth-check"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} aria-invalid={!!fieldErr.acceptTerms} /><span>I accept the <a href="/terms/" target="_blank" rel="noreferrer">Terms &amp; Conditions</a>.</span></label>
          {fieldErr.acceptTerms && <span className="field-error" role="alert"><Icon name="alert" size={14} />{fieldErr.acceptTerms}</span>}
          <label className="imdx-auth-check"><input type="checkbox" checked={privacy} onChange={e => setPrivacy(e.target.checked)} aria-invalid={!!fieldErr.acceptPrivacy} /><span>I accept the <a href="/privacy/" target="_blank" rel="noreferrer">Privacy Policy</a>.</span></label>
          {fieldErr.acceptPrivacy && <span className="field-error" role="alert"><Icon name="alert" size={14} />{fieldErr.acceptPrivacy}</span>}
        </div>
        {msg && (msgOk || !Object.keys(fieldErr).length) && <FormMessage ok={msgOk}>{msg}</FormMessage>}
        <Submit label="Create account & send code" busyLabel="Sending…" />
      </form>
      <footer className="imdx-auth-foot">Already have an account? <button type="button" className="link" onClick={() => go("signin")}>Sign in</button></footer></>}

    {mode === "otp" && <>
      <Head title="Verify your email."><Steps at={2} />Step 2 of 3 — enter the 6-digit code sent to <strong>{email}</strong>.</Head>
      <form className="imdx-auth-form" onSubmit={e => { e.preventDefault(); void run(async () => { const r = await post("/api/auth/register/verify", {challengeId, code}); setupToken.current = r.setupToken; setPassword(""); setConfirm(""); go("password"); }); }}>
        <Field label="Verification code" icon="key" hint={<span id="otp-timer" role="timer" className={left > 0 ? "" : "is-expired"}>{left > 0 ? `Code expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "This code has expired — request a new one."}</span>}>
          {(id, d) => <input id={id} className="imdx-auth-code" value={code} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required onChange={e => setCode(e.target.value.replace(/\D/g, ""))} aria-describedby={d} placeholder="••••••" autoFocus />}
        </Field>
        {msg && (msgOk || !Object.keys(fieldErr).length) && <FormMessage ok={msgOk}>{msg}</FormMessage>}
        <Submit label="Verify code" busyLabel="Verifying…" disabled={code.length !== 6} />
        <div className="imdx-auth-secondary">
          <button type="button" className="ghost portal-plain" disabled={busy || resendIn > 0} onClick={() => void run(async () => { const r = await post("/api/auth/register/resend", {challengeId}); setChallengeId(r.challengeId); setExpiresAt(Date.now() + r.expiresInSeconds * 1000); setResendAt(Date.now() + r.resendAfterSeconds * 1000); info("A new code was sent."); })}>{resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}</button>
          <button type="button" className="ghost portal-plain" onClick={() => go("register")}>Change email address</button>
        </div>
      </form></>}

    {mode === "password" && <>
      <Head title="Create your password."><Steps at={3} />Step 3 of 3 — your email is verified. Choose a password for signing in.</Head>
      <form className="imdx-auth-form" onSubmit={e => { e.preventDefault(); void run(async () => { await post("/api/auth/password/set", {token: setupToken.current, password, confirmPassword: confirm}); setupToken.current = ""; go("done"); }); }}>
        <PasswordFields value={password} confirm={confirm} onChange={setPassword} onConfirm={setConfirm} autoFocus />
        {msg && (msgOk || !Object.keys(fieldErr).length) && <FormMessage ok={msgOk}>{msg}</FormMessage>}
        <Submit label="Create password" busyLabel="Saving…" disabled={password !== confirm || password.length < 10} />
      </form></>}

    {mode === "done" && <div className="imdx-auth-result"><span className="imdx-auth-badge ok"><Icon name="check" size={26} /></span>
      <Head title="Account ready.">Your email is verified and your password is set. You are signed in.</Head>
      <button type="button" className="portal-plain imdx-auth-primary" onClick={onSignedIn}>Go to my dashboard<Arrow /></button></div>}

    {mode === "forgot" && <>
      <Head title="Forgot password.">Enter your email. If an account exists, we will send a link to set a new password (also used once by accounts created before passwords).</Head>
      <form className="imdx-auth-form" onSubmit={e => { e.preventDefault(); void run(async () => { const r = await post("/api/auth/password/forgot", {email}); go("forgot-sent"); setMsg(r.message); }); }} noValidate>
        <Field label="Email address" icon="mail" error={fieldErr.email}>{(id, d) => <input id={id} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} aria-invalid={!!fieldErr.email} aria-describedby={d} placeholder="name@company.com" />}</Field>
        {msg && (msgOk || !Object.keys(fieldErr).length) && <FormMessage ok={msgOk}>{msg}</FormMessage>}
        <Submit label="Send reset link" busyLabel="Sending…" />
      </form>
      <footer className="imdx-auth-foot"><button type="button" className="link" onClick={() => go("signin")}>Back to sign in</button></footer></>}

    {mode === "forgot-sent" && <div className="imdx-auth-result"><span className="imdx-auth-badge"><Icon name="send" size={24} /></span>
      <Head title="Check your email.">{msg}</Head>
      <button type="button" className="portal-plain imdx-auth-ghost" onClick={() => go("signin")}>Back to sign in</button></div>}
  </section>;
}

function FormMessage({ok, children}: {ok: boolean; children: ReactNode}) {
  return <p role={ok ? "status" : "alert"} className={"form-message imdx-auth-msg " + (ok ? "is-ok" : "is-error")}><Icon name={ok ? "check" : "alert"} size={16} /><span>{children}</span></p>;
}
