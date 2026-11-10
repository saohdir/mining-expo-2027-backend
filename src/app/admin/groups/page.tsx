"use client";
import {useConfirm} from "../components/Confirm";
import {useCallback, useEffect, useState} from "react";
type Delegate = {invitationId: string; fullName: string; email: string; invitation: string; registration: string | null};
type Group = {groupId: string; programme: string; feeMinor: string | null; createdAt: string; counts: Record<string, number>; coordinator: {email?: string; name?: string; organization?: string}; delegates: Delegate[]};
type Staff = {id: string; boothRequestId: string; email: string; fullName: string; status: string; createdAt: string};
const call = async (u: string, m = "GET", b?: unknown) => { const r = await fetch(u, {method: m, cache: "no-store", headers: b ? {"Content-Type": "application/json"} : undefined, body: b ? JSON.stringify(b) : undefined}); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || "Request failed"); return j; };

/** FR-059 group delegate review and FR-156 booth representative overview. */
export default function GroupsAdmin() {
  const ask = useConfirm();
  const [groups, setGroups] = useState<Group[]>([]), [staff, setStaff] = useState<{limit: number; staff: Staff[]} | null>(null), [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    try { setGroups((await call("/api/admin/groups")).groups); } catch (e) { setMsg((e as Error).message); }
    try { setStaff(await call("/api/admin/invitations")); } catch {}
  }, []);
  useEffect(() => { void load(); }, [load]);
  const review = async (g: Group, decision: "CONFIRMED" | "REJECTED") => {
    const ok = await ask(decision === "CONFIRMED" ? {title: "Confirm all delegates waiting for review?", tone: "warning", confirmLabel: "Yes, confirm all", changes: ["Every accepted delegate of this group waiting for review becomes CONFIRMED."], impact: ["Conference passes are issued to each delegate.", "Make sure the group invoice is paid."], reason: {min: 8, placeholder: "e.g. invoice INV-2027-0042 paid"}}
      : {title: "Reject all delegates waiting for review?", tone: "danger", confirmLabel: "Yes, reject all", changes: ["Every delegate of this group waiting for review is rejected."], impact: ["They cannot attend with this group registration."], reason: {min: 8}});
    if (!ok) return; const reason = ok.reason;
    try { const r = await call("/api/admin/groups/" + g.groupId + "/review", "POST", {decision, reason}); setMsg(r.reviewed + " delegate registration(s) " + decision.toLowerCase() + "; " + r.passes + " pass(es) issued."); await load(); }
    catch (e) { setMsg((e as Error).message); }
  };
  return <main className="cms-page"><header><p className="eyebrow">OPERATIONS</p><h1>Groups & representatives</h1>
    <p>Group delegate registrations (each delegate has their own account) and exhibitor booth representatives. Confirm a group only after Finance has verified the manual payment.</p></header>
    {msg && <p role="status" className="micro">{msg}</p>}
    <h2>Group delegate registrations</h2>
    {!groups.length && <p className="micro">No group registrations.</p>}
    {groups.map(g => <article className="cms-card" key={g.groupId}>
      <h3>{g.programme}</h3>
      <p className="micro">Coordinator {g.coordinator.name || "—"} · {g.coordinator.organization || "—"} · {g.coordinator.email} · created {new Date(g.createdAt).toLocaleString("en-GB", {timeZone: "Asia/Jakarta"})} WIB · fee per delegate {g.feeMinor === null ? "not set" : "IDR " + Number(g.feeMinor).toLocaleString("id-ID")}</p>
      <p>{Object.entries(g.counts).map(([k, v]) => k + ": " + v).join(" · ")}</p>
      <table className="cms-table"><thead><tr><th>Delegate</th><th>Email</th><th>Invitation</th><th>Registration</th></tr></thead><tbody>
        {g.delegates.map(d => <tr key={d.invitationId}><td>{d.fullName}</td><td>{d.email}</td><td>{d.invitation}</td><td>{d.registration || "—"}</td></tr>)}</tbody></table>
      <div className="cms-row-actions"><button className="cms-small" onClick={() => void review(g, "CONFIRMED")}>Confirm waiting delegates</button><button className="ghost cms-small" onClick={() => void review(g, "REJECTED")}>Reject waiting delegates</button></div>
    </article>)}
    <h2>Booth representatives</h2>
    {staff && <p className="micro">Limit per confirmed booth: {staff.limit} (EXHIBITOR_STAFF_LIMIT).</p>}
    <table className="cms-table"><thead><tr><th>Booking</th><th>Name</th><th>Email</th><th>Status</th><th>Invited (WIB)</th></tr></thead><tbody>
      {staff?.staff.map(s => <tr key={s.id}><td>{s.boothRequestId.slice(0, 8)}</td><td>{s.fullName}</td><td>{s.email}</td><td>{s.status}</td><td>{new Date(s.createdAt).toLocaleString("en-GB", {timeZone: "Asia/Jakarta"})}</td></tr>)}</tbody></table>
  </main>;
}
