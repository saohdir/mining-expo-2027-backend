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
