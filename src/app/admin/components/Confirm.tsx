"use client";
/** CMS confirmation modal: says what will change and what it affects, asks the audit reason (and an extra value such as a
 * new password or a typed word when needed), then lets the user continue or cancel. Replaces window.confirm/prompt
 * (which some browsers and embedded views block silently) and "type a reason first" disabled buttons. */
import {createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode} from "react";

export type ConfirmOptions = {
  title: string;
  intro?: string;
  changes?: string[];
  impact?: string[];
  tone?: "warning" | "danger" | "info";
  confirmLabel?: string;
  cancelLabel?: string;
  /** Ask an audit reason (min characters). `initial` pre-fills it, e.g. from a reason field on the page. */
  reason?: {min: number; label?: string; initial?: string; placeholder?: string};
  /** Ask one more value (new password, number…). */
  field?: {label: string; type?: "text" | "password" | "number"; minLength?: number; placeholder?: string; initial?: string};
  /** Require typing this exact word (for irreversible actions). */
  typed?: string;
  /** Shown as a "Super Admin override" badge. */
  override?: boolean;
};
export type ConfirmResult = {reason: string; value: string};
type Ask = (o: ConfirmOptions) => Promise<ConfirmResult | null>;
const Ctx = createContext<Ask | null>(null);
export const useConfirm = () => { const c = useContext(Ctx); if (!c) throw new Error("ConfirmProvider missing"); return c; };

export function ConfirmProvider({children}: {children: ReactNode}) {
  const [req, setReq] = useState<{o: ConfirmOptions; resolve: (r: ConfirmResult | null) => void} | null>(null);
  const ask = useCallback<Ask>(o => new Promise(resolve => setReq(prev => { prev?.resolve(null); return {o, resolve}; })), []);
  return <Ctx.Provider value={ask}>{children}{req && <ConfirmDialog key={req.o.title + (req.o.reason?.initial || "")} o={req.o} done={r => { req.resolve(r); setReq(null); }}/>}</Ctx.Provider>;
}

function ConfirmDialog({o, done}: {o: ConfirmOptions; done: (r: ConfirmResult | null) => void}) {
  const id = useId(), box = useRef<HTMLDivElement>(null), opener = useRef<Element | null>(null);
  const [reason, setReason] = useState(o.reason?.initial || ""), [value, setValue] = useState(o.field?.initial || ""), [typed, setTyped] = useState("");
  useEffect(() => {
    opener.current = document.activeElement;
    const first = box.current?.querySelector<HTMLElement>("textarea,input,button.cms-confirm-go");
    first?.focus();
    return () => { (opener.current as HTMLElement | null)?.focus?.(); };
  }, []);
  const reasonOk = !o.reason || reason.trim().length >= o.reason.min;
  const valueOk = !o.field || value.trim().length >= (o.field.minLength || 1);
  const typedOk = !o.typed || typed.trim() === o.typed;
  const ok = reasonOk && valueOk && typedOk;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); done(null); return; }
    if (e.key !== "Tab" || !box.current) return;
    const f = [...box.current.querySelectorAll<HTMLElement>("button:not([disabled]),input,textarea,select")];
    if (!f.length) return; const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  };
  return <div className="cms-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) done(null); }}>
    <div className={"cms-modal cms-modal-" + (o.tone || "warning")} role="alertdialog" aria-modal="true" aria-labelledby={id + "-t"} aria-describedby={id + "-d"} ref={box} onKeyDown={onKey}>
      <form onSubmit={e => { e.preventDefault(); if (ok) done({reason: reason.trim(), value: value.trim()}); }}>
        <div className="cms-modal-head"><span className="cms-modal-icon" aria-hidden="true">{o.tone === "danger" ? "!" : o.tone === "info" ? "i" : "⚠"}</span>
          <div><h2 id={id + "-t"}>{o.title}</h2>{o.override && <span className="cms-modal-badge">Super Admin override</span>}</div></div>
        <div id={id + "-d"} className="cms-modal-body">
          {o.intro && <p>{o.intro}</p>}
          {o.changes?.length ? <><h3>What will change</h3><ul>{o.changes.map(c => <li key={c}>{c}</li>)}</ul></> : null}
          {o.impact?.length ? <><h3>Impact</h3><ul>{o.impact.map(c => <li key={c}>{c}</li>)}</ul></> : null}
          {o.field && <label>{o.field.label}<input type={o.field.type || "text"} value={value} minLength={o.field.minLength} placeholder={o.field.placeholder}
            autoComplete={o.field.type === "password" ? "new-password" : "off"} onChange={e => setValue(e.target.value)}/>
            {o.field.minLength ? <small>{Math.max(0, o.field.minLength - value.trim().length) ? `${o.field.minLength - value.trim().length} more character(s) needed` : "OK"}</small> : null}</label>}
          {o.reason && <label>{o.reason.label || "Reason (saved in the audit log)"}<textarea rows={2} value={reason} maxLength={500} placeholder={o.reason.placeholder || "e.g. requested by the organizer on 12 Nov"} onChange={e => setReason(e.target.value)}/>
            <small>{reasonOk ? "OK" : `${o.reason.min - reason.trim().length} more character(s) needed`}</small></label>}
          {o.typed && <label><span>Type <strong>{o.typed}</strong> to confirm</span><input value={typed} autoComplete="off" onChange={e => setTyped(e.target.value)}/></label>}
        </div>
        <div className="cms-modal-actions">
          <button type="button" className="ghost" onClick={() => done(null)}>{o.cancelLabel || "No, cancel"}</button>
          <button type="submit" className={"cms-confirm-go" + (o.tone === "danger" ? " cms-danger" : "")} disabled={!ok}>{o.confirmLabel || "Yes, continue"}</button>
        </div>
      </form>
    </div>
  </div>;
}

/** Business rules a Super Admin may override after an explicit warning. The server accepts `override: true` only from
 * Super Admin and writes an "…_OVERRIDE" audit entry. Data-integrity rules (double booking, amounts above the balance,
 * concurrent edits, last Super Admin) are not overridable. */
/** Endpoints that accept `override: true` for each rule. The same error code can come from endpoints without an
 * override path (e.g. PAYMENT_REQUIRED from booth assignment, where payment must really be verified first); those
 * keep their normal error instead of offering an override that the server would reject. */
export const OVERRIDE_SCOPE: Record<string, RegExp> = {
  SAME_ACTOR: /\/api\/admin\/manual-transfers\/[^/]+\/approve/,
  SECOND_APPROVER_REQUIRED: /\/api\/admin\/mailouts\/[^/]+\/approve/,
  SELF_LOCKOUT: /\/api\/admin\/staff\//,
  PAYMENT_REQUIRED: /\/api\/admin\/registrations\/[^/]+\/review/,
  VISITOR_POLICY: /\/api\/admin\/registrations\/[^/]+\/review/,
  EXHIBITOR_POLICY: /\/api\/admin\/registrations\/[^/]+\/review/,
  FEE_NOT_APPROVED: /\/api\/admin\/registrations\/[^/]+\/review/,
  INVALID_TRANSITION: /\/api\/admin\/booth-requests\/[^/]+\/status/,
};
export const OVERRIDES: Record<string, Omit<ConfirmOptions, "reason" | "override">> = {
  SAME_ACTOR: {title: "Approve a receipt you recorded yourself?", tone: "danger",
    changes: ["The receipt is marked VERIFIED and the invoice balance is recalculated."],
    impact: ["Skips the four-eyes check (a second person approving high-value payments).", "The customer is notified that payment was verified.", "Recorded in the audit log as a self-approval override."]},
  SECOND_APPROVER_REQUIRED: {title: "Approve your own mailout?", tone: "warning",
    changes: ["The mailout becomes SCHEDULED and is sent automatically at its send time."],
    impact: ["Skips the second-person review of wording and recipients.", "Recorded in the audit log as an override."]},
  SELF_LOCKOUT: {title: "Change your own Super Admin access?", tone: "danger",
    changes: ["Your role or active status changes immediately and your sessions are signed out."],
    impact: ["You may lose access to the CMS pages that need Super Admin.", "Another active Super Admin remains and can restore your access."]},
  PAYMENT_REQUIRED: {title: "Confirm a conference seat without verified payment?", tone: "danger",
    changes: ["The registration becomes CONFIRMED and a conference pass is issued."],
    impact: ["The invoice is not paid in full according to Finance.", "The delegate can enter the conference session with the pass.", "Recorded in the audit log as an override."]},
  VISITOR_POLICY: {title: "Confirm this visitor manually?", tone: "warning",
    changes: ["The visitor registration becomes CONFIRMED."],
    impact: ["Bypasses the automatic visitor entry policy.", "Recorded in the audit log as an override."]},
  EXHIBITOR_POLICY: {title: "Confirm this exhibitor without booth allocation?", tone: "warning",
    changes: ["The exhibitor registration becomes CONFIRMED."],
    impact: ["Normally confirmed through quotation, payment and booth assignment; that workflow is skipped.", "Recorded in the audit log as an override."]},
  FEE_NOT_APPROVED: {title: "Confirm without an approved conference fee?", tone: "warning",
    changes: ["The registration becomes CONFIRMED and a conference pass is issued."],
    impact: ["The programme has no approved fee, so no invoice is expected.", "Recorded in the audit log as an override."]},
  INVALID_TRANSITION: {title: "Force this booth request status?", tone: "danger",
    changes: ["The booth request moves to the chosen status outside the normal order."],
    impact: ["Quotations, invoices and assignments are not changed automatically; check them afterwards.", "The customer is notified of the new status.", "Recorded in the audit log as an override."]}
};
