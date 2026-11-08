"use client";
import {useCallback, useEffect, useState} from "react";

type Staff = {id: string; email: string; fullName: string; status: string; expiresAt: string};
async function call(path: string, method = "GET", body?: unknown) {
  const r = await fetch(path, {method, cache: "no-store", headers: body ? {"Content-Type": "application/json"} : undefined, body: body ? JSON.stringify(body) : undefined});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.issues?.map((i: {message: string}) => i.message).join(", ") || "Request failed");
  return j;
}

/** FR-156: booth representatives of a confirmed booking — each gets their own account and expo QR pass. */
export function BoothStaffPanel({boothRequestId}: {boothRequestId: string}) {
  const [data, setData] = useState<{limit: number; used: number; staff: Staff[]} | null>(null);
  const [email, setEmail] = useState(""), [name, setName] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(() => call("/api/customer/booth-requests/" + boothRequestId + "/staff").then(setData).catch(e => setMsg(e.message)), [boothRequestId]);
  useEffect(() => { void load(); }, [load]);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); setMsg(""); try { await fn(); setMsg(ok); await load(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } };
  return <div className="booth-staff" data-testid="booth-staff">
    <h4>Booth representatives</h4>
    <p className="micro">Invite colleagues who will staff the booth. Each person signs in with their own account and receives an individual expo QR pass. {data && <>Used {data.used} of {data.limit}.</>}</p>
    {data?.staff.map(s => <div className="record" key={s.id}><div><strong>{s.fullName}</strong><span className="micro"> · {s.email} · {s.status}</span></div>
      {["INVITED", "ACCEPTED"].includes(s.status) && <button className="ghost" disabled={busy} onClick={() => { if (confirm("Remove " + s.fullName + "? Their pass will stop working.")) void run(() => call("/api/customer/booth-requests/" + boothRequestId + "/staff/" + s.id, "DELETE"), "Representative removed."); }}>Remove</button>}</div>)}
    {data && data.used < data.limit && <form onSubmit={e => { e.preventDefault(); void run(() => call("/api/customer/booth-requests/" + boothRequestId + "/staff", "POST", {email, fullName: name}).then(() => { setEmail(""); setName(""); }), "Invitation sent."); }}>
      <label>Full name<input required minLength={2} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Email<input required type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <button disabled={busy}>Invite representative</button></form>}
    {msg && <p className="micro" role="status">{msg}</p>}
  </div>;
}

type Group = {groupId: string; programme: string; delegates: {id: string; fullName: string; email: string; invitation: string; registration: string | null}[]};
/** FR-059: register several delegates for one programme; each delegate confirms with their own account. */
export function GroupRegistrationPanel({conferences}: {conferences: {id: string; title: string; registrationState: string; remainingSeats: number | null}[]}) {
  const [groups, setGroups] = useState<Group[]>([]), [max, setMax] = useState(25);
  const [conf, setConf] = useState(""), [rows, setRows] = useState([{fullName: "", email: ""}, {fullName: "", email: ""}]), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(() => call("/api/customer/group-registrations").then(j => { setGroups(j.groups); setMax(j.max); }).catch(e => setMsg(e.message)), []);
  useEffect(() => { void load(); }, [load]);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); setMsg(""); try { await fn(); setMsg(ok); await load(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } };
  const set = (i: number, k: "fullName" | "email", v: string) => setRows(r => r.map((x, j) => j === i ? {...x, [k]: v} : x));
  return <div className="group-registration" data-testid="group-registration">
    <h3>Register a group of delegates</h3>
    <p className="micro">Each delegate receives an email invitation and confirms with their own account. Seats are taken when a delegate accepts; the organizer confirms after the manual invoice is settled.</p>
    {groups.map(g => <details key={g.groupId} className="booth-history"><summary>{g.programme} · {g.delegates.length} delegates</summary>
      {g.delegates.map(d => <div className="record" key={d.id}><div><strong>{d.fullName}</strong><span className="micro"> · {d.email} · invitation {d.invitation}{d.registration ? " · registration " + d.registration : ""}</span></div>
        {(d.invitation === "INVITED" || (d.invitation === "ACCEPTED" && d.registration !== "CONFIRMED")) && <button className="ghost" disabled={busy} onClick={() => void run(() => call("/api/customer/group-registrations/" + g.groupId, "DELETE", {invitationId: d.id}), "Delegate withdrawn.")}>Withdraw</button>}</div>)}
    </details>)}
    <form onSubmit={e => { e.preventDefault(); void run(() => call("/api/customer/group-registrations", "POST", {conferenceId: conf, delegates: rows, consent: true}).then(() => setRows([{fullName: "", email: ""}, {fullName: "", email: ""}])), "Invitations sent to your delegates."); }}>
      <label>Programme<select required value={conf} onChange={e => setConf(e.target.value)}><option value="">Choose a programme</option>
        {conferences.map(c => <option key={c.id} value={c.id} disabled={c.registrationState !== "AVAILABLE"}>{c.title}{c.remainingSeats !== null ? " · " + c.remainingSeats + " seats" : ""}</option>)}</select></label>
      {rows.map((r, i) => <div className="field-pair" key={i}>
        <label>Delegate {i + 1} name<input required minLength={2} value={r.fullName} onChange={e => set(i, "fullName", e.target.value)} /></label>
        <label>Delegate {i + 1} email<input required type="email" value={r.email} onChange={e => set(i, "email", e.target.value)} /></label></div>)}
      <div className="button-row">
        {rows.length < max && <button type="button" className="ghost" onClick={() => setRows(r => [...r, {fullName: "", email: ""}])}>Add delegate</button>}
        {rows.length > 2 && <button type="button" className="ghost" onClick={() => setRows(r => r.slice(0, -1))}>Remove last</button>}
        <label className="consent"><input type="checkbox" required /> I confirm the delegates agreed to be registered and to receive emails.</label>
        <button disabled={busy || !conf}>Send delegate invitations</button></div>
    </form>
    {msg && <p className="micro" role="status">{msg}</p>}
  </div>;
}
