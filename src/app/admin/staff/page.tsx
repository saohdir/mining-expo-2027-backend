"use client";
import {useCallback, useEffect, useState} from "react";
import {useCmsSession} from "../components/CmsShell";
import {useConfirm} from "../components/Confirm";
import CmsStatus from "../components/CmsStatus";

const ROLES = ["SUPER_ADMIN", "SALES", "FINANCE", "OPERATIONS", "CONTENT_EDITOR", "CHECKIN_STAFF", "VIEWER"];
const ROLE_INFO: Record<string, string> = {
  SUPER_ADMIN: "Full access to every CMS area, settings, staff and overrides",
  SALES: "Registrations, booth requests, quotations, invoices (no payment verification)",
  FINANCE: "Invoices, payment verification, refunds and finance exports",
  OPERATIONS: "Registrations, floorplans, booth assignment, gates, check-in, mailouts",
  CONTENT_EDITOR: "Website pages, content, programme pages and gallery",
  CHECKIN_STAFF: "Gate QR scanner only",
  VIEWER: "Read-only reports and content"
};
const nice = (r: string) => r.toLowerCase().replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
type Staff = {id: string; email: string; role: string; active: boolean; createdAt: string};
const call = async (u: string, m = "GET", b?: unknown) => { const r = await fetch(u, {method: m, cache: "no-store", headers: b ? {"Content-Type": "application/json"} : undefined, body: b ? JSON.stringify(b) : undefined}); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || j.issues?.map((i: {message: string}) => i.message).join(", ") || "Request failed"); return j; };

/** FR-147 staff & roles (SUPER_ADMIN). Each change opens a confirmation that explains its effect and asks the audit reason;
 * sessions are revoked on role/password/deactivation changes. */
export default function StaffPage() {
  const {actor} = useCmsSession();
  const ask = useConfirm();
  const [staff, setStaff] = useState<Staff[]>([]), [msg, setMsg] = useState<{text: string; err?: boolean} | null>(null), [busy, setBusy] = useState(false);
  const [f, setF] = useState({email: "", role: "VIEWER", temporaryPassword: ""});
  const load = useCallback(async () => { try { setStaff((await call("/api/admin/staff")).staff); } catch (e) { setMsg({text: (e as Error).message, err: true}); } }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (fn: () => Promise<unknown>, ok: string) => { setMsg(null); setBusy(true); try { await fn(); setMsg({text: ok}); await load(); } catch (e) { setMsg({text: (e as Error).message, err: true}); } finally { setBusy(false); } };
  const supers = staff.filter(s => s.role === "SUPER_ADMIN" && s.active).length;
  const self = (s: Staff) => s.id === actor?.id;

  const changeRole = async (s: Staff, role: string) => {
    if (role === s.role) return;
    const r = await ask({title: `Change ${s.email} to ${nice(role)}?`, tone: role === "SUPER_ADMIN" || s.role === "SUPER_ADMIN" ? "danger" : "warning",
      changes: [`Role: ${nice(s.role)} → ${nice(role)}.`, `New access: ${ROLE_INFO[role]}.`],
      impact: ["This person is signed out everywhere and signs in again with the new access.",
        ...(["CHECKIN_STAFF", "OPERATIONS", "SUPER_ADMIN"].includes(role) ? [] : ["Gate assignments for scanning are removed."]),
        ...(self(s) ? ["This is your own account: you lose Super Admin pages after you are signed out."] : []),
        ...(s.role === "SUPER_ADMIN" && supers <= 1 ? ["Blocked: at least one active Super Admin must remain."] : [])],
      confirmLabel: "Yes, change role", reason: {min: 8}});
    if (r) await act(() => call("/api/admin/staff/" + s.id, "PATCH", {role, reason: r.reason, ...(self(s) ? {override: true} : {})}), `Role changed to ${nice(role)}; sessions revoked.`);
  };
  const toggle = async (s: Staff) => {
    const r = await ask(s.active
      ? {title: `Deactivate ${s.email}?`, tone: "danger", changes: ["The account can no longer sign in to the CMS."],
          impact: ["All open sessions are signed out immediately.", "Gate assignments are removed.", "Records and audit history created by this person are kept.", "You can reactivate the account later.",
            ...(self(s) ? ["This is your own account: you are signed out now."] : [])], confirmLabel: "Yes, deactivate", reason: {min: 8}}
      : {title: `Reactivate ${s.email}?`, tone: "info", changes: ["The account can sign in again with its current password and role (" + nice(s.role) + ")."], confirmLabel: "Yes, reactivate", reason: {min: 8}});
    if (r) await act(() => call("/api/admin/staff/" + s.id, "PATCH", {active: !s.active, reason: r.reason, ...(self(s) ? {override: true} : {})}), s.active ? "Account deactivated; sessions revoked." : "Account reactivated.");
  };
  const resetPassword = async (s: Staff) => {
    const r = await ask({title: `Reset the password of ${s.email}?`, tone: "warning",
      changes: ["The old password stops working; the temporary password below becomes the only valid one."],
      impact: ["This person is signed out everywhere.", "Share the temporary password through a secure channel (not chat or e-mail threads) and ask them to keep it private."],
      field: {label: "New temporary password (min. 14 characters)", type: "password", minLength: 14}, confirmLabel: "Yes, reset password", reason: {min: 8}});
    if (r) await act(() => call("/api/admin/staff/" + s.id, "PATCH", {newPassword: r.value, reason: r.reason}), "Password reset; sessions revoked.");
  };
  const create = async () => {
    const r = await ask({title: `Create a staff account for ${f.email}?`, tone: f.role === "SUPER_ADMIN" ? "danger" : "info",
      changes: [`New ${nice(f.role)} account, active immediately.`, `Access: ${ROLE_INFO[f.role]}.`],
      impact: ["The person signs in at /admin with this e-mail and the temporary password you set.", ...(f.role === "SUPER_ADMIN" ? ["Super Admin can change every setting, staff account and override safety rules."] : [])],
      confirmLabel: "Yes, create account", reason: {min: 8, initial: "New staff member onboarding"}});
    if (r) await act(async () => { await call("/api/admin/staff", "POST", {...f, reason: r.reason}); setF({email: "", role: "VIEWER", temporaryPassword: ""}); }, "Staff account created for " + f.email + ".");
  };

  return <main className="cms-page"><header className="imdx-cms-heading"><div><h1>Staff &amp; roles</h1><p>Permissions are enforced server-side per action. Every change asks for confirmation and a reason for the audit log.</p></div></header>
    {msg && <p role={msg.err ? "alert" : "status"} className={msg.err ? "cms-dl-error" : "notice"}>{msg.text}</p>}
    <section className="cms-panel" style={{padding: 0}} aria-label="Staff accounts">
      <table className="cms-table"><thead><tr><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>
        {staff.map(s => <tr key={s.id}><td>{s.email}{self(s) && <span className="cms-sub">You</span>}</td>
          <td><select aria-label={"Role for " + s.email} value={s.role} disabled={busy} onChange={e => void changeRole(s, e.target.value)}>{ROLES.map(x => <option key={x} value={x}>{nice(x)}</option>)}</select></td>
          <td><CmsStatus domain="Account" value={s.active ? "ACTIVE" : "SUSPENDED"}/></td>
          <td><div className="cms-row-actions"><button type="button" className="ghost cms-small" disabled={busy} onClick={() => void toggle(s)}>{s.active ? "Deactivate" : "Reactivate"}</button>
            <button type="button" className="ghost cms-small" disabled={busy} onClick={() => void resetPassword(s)}>Reset password</button></div></td></tr>)}
      </tbody></table>
    </section>
    <section className="cms-panel" aria-labelledby="add-staff-h"><h2 id="add-staff-h">Add staff</h2>
      <form className="form-grid" onSubmit={e => { e.preventDefault(); void create(); }}>
        <label>Email<input type="email" required value={f.email} onChange={e => setF({...f, email: e.target.value})} /></label>
        <label>Role<select value={f.role} onChange={e => setF({...f, role: e.target.value})}>{ROLES.map(x => <option key={x} value={x}>{nice(x)}</option>)}</select><small className="micro">{ROLE_INFO[f.role]}</small></label>
        <label>Temporary password (min. 14 characters)<input type="password" required minLength={14} autoComplete="new-password" value={f.temporaryPassword} onChange={e => setF({...f, temporaryPassword: e.target.value})} /></label>
        <button disabled={busy}>Create staff account</button></form></section>
  </main>;
}
