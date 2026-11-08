"use client";
import {useCallback, useEffect, useState} from "react";

type Gate = {id: string; code: string; name: string; zones: string[]; active: boolean; staff?: {adminId: string}[]};
type Staff = {id: string; email: string; role: string};
type Pass = {id: string; status: string; entitlement: string; issuedAt: string; revokeReason: string | null; replacedById: string | null; enrollment: {type: string; status: string}; account: {email: string | null; profile: {fullName: string} | null}; _count: {admissions: number}};
async function call(url: string, method = "GET", data?: unknown) {
  const r = await fetch(url, {method, cache: "no-store", headers: data ? {"Content-Type": "application/json"} : undefined, body: data ? JSON.stringify(data) : undefined});
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.message || b.error || "Request failed");
  return b;
}

/** Operations: gates, staff gate assignments, zone re-entry policy, pass revoke/reissue (FR-081/085/137). */
export default function AdmissionSettings() {
  const [gates, setGates] = useState<Gate[]>([]), [policies, setPolicies] = useState<{zone: string; reentry: string}[]>([]), [staff, setStaff] = useState<Staff[]>([]);
  const [msg, setMsg] = useState(""), [reason, setReason] = useState(""), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({code: "", name: "", zones: "EXPO_ENTRY"}), [q, setQ] = useState(""), [passes, setPasses] = useState<Pass[]>([]);
  const load = useCallback(async () => {
    try { const g = await call("/api/admin/gates"); setGates(g.gates); setPolicies(g.policies); setStaff((await call("/api/admin/staff")).staff); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Unable to load"); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const act = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); setMsg(""); try { await fn(); setMsg(ok); await load(); } catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); } };
  const reasonOk = reason.trim().length >= 8;
  const scanners = staff.filter(s => ["CHECKIN_STAFF", "OPERATIONS", "SUPER_ADMIN"].includes(s.role));
  const zones = [...new Set(["EXPO_ENTRY", "CONFERENCE", ...gates.flatMap(g => g.zones)])];
  return <main className="cms-page">
    <header><p className="eyebrow">OPERATIONS / ADMISSION</p><h1>Gates, staff &amp; passes</h1>
      <p>Scanner staff can only validate passes at gates assigned here. Every change requires a reason and is audited.</p></header>
    <label>Reason / audit note (min 8 chars)<input value={reason} onChange={e => setReason(e.target.value)} maxLength={300} /></label>
    {msg && <p role="status" className="micro">{msg}</p>}
    <section className="cms-card"><h2>Gates</h2>
      <table className="cms-table"><thead><tr><th>Gate</th><th>Zones</th><th>Assigned staff</th><th>Status</th></tr></thead><tbody>
        {gates.map(g => <tr key={g.id}><td>{g.name} ({g.code})</td><td>{g.zones.join(", ")}</td>
          <td><select multiple aria-label={"Staff for " + g.code} value={(g.staff || []).map(s => s.adminId)} disabled={busy || !reasonOk}
            onChange={e => { const ids = [...e.target.selectedOptions].map(o => o.value); void act(() => call("/api/admin/gates/" + g.id, "PATCH", {staffAdminIds: ids, reason}), "Gate staff updated."); }}>
            {scanners.map(s => <option key={s.id} value={s.id}>{s.email} · {s.role}</option>)}</select></td>
          <td><button className="ghost" disabled={busy || !reasonOk} onClick={() => void act(() => call("/api/admin/gates/" + g.id, "PATCH", {active: !g.active, reason}), "Gate updated.")}>{g.active ? "Deactivate" : "Activate"}</button></td></tr>)}
      </tbody></table>
      <form className="form-grid" onSubmit={e => { e.preventDefault(); void act(() => call("/api/admin/gates", "POST", {code: form.code, name: form.name, zones: form.zones.split(",").map(z => z.trim().toUpperCase()).filter(Boolean)}), "Gate created."); }}>
        <label>Gate code<input required value={form.code} onChange={e => setForm({...form, code: e.target.value})} pattern="[A-Za-z0-9_-]{1,30}" /></label>
        <label>Gate name<input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} /></label>
        <label>Zones (comma separated)<input required value={form.zones} onChange={e => setForm({...form, zones: e.target.value})} /></label>
        <button disabled={busy}>Create gate</button>
      </form>
    </section>
    <section className="cms-card"><h2>Re-entry policy per zone</h2>
      <p className="micro">Default when not set: ONCE_PER_DAY (one admission per person, zone and WIB day).</p>
      {zones.map(z => { const cur = policies.find(p => p.zone === z)?.reentry || "ONCE_PER_DAY"; return <div key={z} className="cms-row-actions"><strong>{z}</strong> <span className="micro">{cur}</span>
        <button className="ghost" disabled={busy || !reasonOk} onClick={() => void act(() => call("/api/admin/admission-policy", "PUT", {zone: z, reentry: cur === "ONCE_PER_DAY" ? "ALLOW_REENTRY" : "ONCE_PER_DAY", reason}), "Policy updated.")}>Switch to {cur === "ONCE_PER_DAY" ? "ALLOW_REENTRY" : "ONCE_PER_DAY"}</button></div>; })}
    </section>
    <section className="cms-card"><h2>Pass administration</h2>
      <form className="cms-row-actions" onSubmit={e => { e.preventDefault(); void call("/api/admin/passes?q=" + encodeURIComponent(q)).then(b => setPasses(b.passes)).catch(err => setMsg(err.message)); }}>
        <label>Search by email, name or registration id<input value={q} onChange={e => setQ(e.target.value)} minLength={3} required /></label><button>Search</button></form>
      <table className="cms-table"><thead><tr><th>Holder</th><th>Registration</th><th>Pass</th><th>Admissions</th><th /></tr></thead><tbody>
        {passes.map(p => <tr key={p.id}><td>{p.account.profile?.fullName || p.account.email}</td><td>{p.enrollment.type} · {p.enrollment.status}</td>
          <td>{p.status}{p.revokeReason ? " — " + p.revokeReason : ""}{p.replacedById ? " (replaced)" : ""}</td><td>{p._count.admissions}</td>
          <td>{p.status === "ACTIVE" && <button className="ghost" disabled={busy || !reasonOk} onClick={() => void act(() => call("/api/admin/passes/" + p.id + "/revoke", "POST", {reason}), "Pass revoked.")}>Revoke</button>}
            {!p.replacedById && <button disabled={busy || !reasonOk} onClick={() => void act(() => call("/api/admin/passes/" + p.id + "/reissue", "POST", {reason}), "New pass issued; old QR invalid.")}>Reissue</button>}</td></tr>)}
      </tbody></table>
    </section>
  </main>;
}
