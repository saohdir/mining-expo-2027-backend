"use client";
import {useCallback, useEffect, useState} from "react";

const ROLES = ["SUPER_ADMIN", "SALES", "FINANCE", "OPERATIONS", "CONTENT_EDITOR", "CHECKIN_STAFF", "VIEWER"];
type Staff = {id: string; email: string; role: string; active: boolean; createdAt: string};
const call = async (u: string, m = "GET", b?: unknown) => { const r = await fetch(u, {method: m, cache: "no-store", headers: b ? {"Content-Type": "application/json"} : undefined, body: b ? JSON.stringify(b) : undefined}); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || "Request failed"); return j; };

/** FR-147 staff & roles (SUPER_ADMIN). Every change needs a reason; sessions are revoked on role/password/deactivation changes. */
export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]), [msg, setMsg] = useState(""), [reason, setReason] = useState(""), [f, setF] = useState({email: "", role: "VIEWER", temporaryPassword: ""});
  const load = useCallback(async () => { try { setStaff((await call("/api/admin/staff")).staff); } catch (e) { setMsg((e as Error).message); } }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (fn: () => Promise<unknown>, ok: string) => { setMsg(""); try { await fn(); setMsg(ok); await load(); } catch (e) { setMsg((e as Error).message); } };
  const r = reason.trim().length >= 8;
  return <main className="cms-page"><header><p className="eyebrow">SYSTEM</p><h1>Staff &amp; roles</h1><p>Permissions are enforced server-side per action. Keep at least one active Super Admin.</p></header>
    <label>Reason / audit note (min 8 chars)<input value={reason} onChange={e => setReason(e.target.value)} /></label>
    {msg && <p role="status" className="micro">{msg}</p>}
    <table className="cms-table"><thead><tr><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead><tbody>
      {staff.map(s => <tr key={s.id}><td>{s.email}</td>
        <td><select aria-label={"Role for " + s.email} value={s.role} disabled={!r} onChange={e => void act(() => call("/api/admin/staff/" + s.id, "PATCH", {role: e.target.value, reason}), "Role changed; sessions revoked.")}>{ROLES.map(x => <option key={x}>{x}</option>)}</select></td>
        <td>{s.active ? "Active" : "Deactivated"}</td>
        <td><button className="ghost" disabled={!r} onClick={() => void act(() => call("/api/admin/staff/" + s.id, "PATCH", {active: !s.active, reason}), "Updated.")}>{s.active ? "Deactivate" : "Reactivate"}</button>
          <button className="ghost" disabled={!r} onClick={() => { const p = window.prompt("New temporary password (min 14 chars). Share it securely, never by chat."); if (p) void act(() => call("/api/admin/staff/" + s.id, "PATCH", {newPassword: p, reason}), "Password reset; sessions revoked."); }}>Reset password</button></td></tr>)}
    </tbody></table>
    <h2>Add staff</h2>
    <form className="form-grid" onSubmit={e => { e.preventDefault(); void act(() => call("/api/admin/staff", "POST", {...f, reason}), "Staff created."); }}>
      <label>Email<input type="email" required value={f.email} onChange={e => setF({...f, email: e.target.value})} /></label>
      <label>Role<select value={f.role} onChange={e => setF({...f, role: e.target.value})}>{ROLES.map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Temporary password (min 14)<input type="password" required minLength={14} autoComplete="new-password" value={f.temporaryPassword} onChange={e => setF({...f, temporaryPassword: e.target.value})} /></label>
      <button disabled={!r}>Create staff account</button></form>
  </main>;
}
