"use client";
import {useEffect,useState} from "react";
import {useCmsSession,CmsIcon} from "../components/CmsShell";

type AuditRow={
  id:string;action:string;resourceType:string;resourceId:string;adminId:string|null;
  accountId:string|null;createdAt:string;beforeState:unknown;afterState:unknown
};
type Response={total:number;page:number;limit:number;records:AuditRow[]};
const date=(v:string)=>new Date(v).toLocaleString("en-GB",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})+" WIB";
const pretty=(v:unknown)=>v===null?"No snapshot":JSON.stringify(v,null,2);
export default function AuditPage(){
  const {actor}=useCmsSession();
  const [page,setPage]=useState(1),[action,setAction]=useState(""),[resource,setResource]=useState("");
  const [appliedAction,setAppliedAction]=useState(""),[appliedResource,setAppliedResource]=useState("");
  const [data,setData]=useState<Response|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{
    if(actor?.role!=="SUPER_ADMIN")return;
    const controller=new AbortController();
    const p=new URLSearchParams({page:String(page)});
    if(appliedAction)p.set("action",appliedAction);if(appliedResource)p.set("resourceType",appliedResource);
    setLoading(true);setError("");
    fetch("/api/admin/audit?"+p.toString(),{cache:"no-store",signal:controller.signal})
    .then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||"Audit is unavailable");return d})
    .then(d=>{if(!controller.signal.aborted)setData(d)})
    .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Audit is unavailable")})
    .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[actor,page,appliedAction,appliedResource]);
  if(actor?.role!=="SUPER_ADMIN")return <div className="warning" role="alert">Audit records require SUPER_ADMIN permission.</div>;
  return <>
    <div className="imdx-cms-breadcrumb">IMDX 2027 <span>/</span> System <span>/</span> <b>Audit Log</b></div>
    <header className="imdx-cms-heading"><div><p className="eyebrow">SYSTEM / READ ONLY</p><h1>Audit <em>history.</em></h1>
      <p>Append-only activity records with actor, resource, time and before/after snapshots. Audit records cannot be edited or deleted.</p></div></header>
    <form className="imdx-cms-filterbar" onSubmit={e=>{e.preventDefault();setPage(1);setAppliedAction(action.trim());setAppliedResource(resource.trim())}}>
      <label>Action<input value={action} placeholder="e.g. BOOTH_ASSIGNED" onChange={e=>setAction(e.target.value)}/></label>
      <label>Resource type<input value={resource} placeholder="BoothRequest, Invoice…" onChange={e=>setResource(e.target.value)}/></label>
      <button type="submit" className="cms-small">Apply filters</button>
      <span className="imdx-cms-timezone"><CmsIcon name="clock" size={16}/> Event timestamps: WIB (UTC+7)</span>
    </form>
    {error&&<div className="warning" role="alert">{error}</div>}
    <section className="imdx-cms-panel">
      <div className="imdx-cms-panel-title"><h2>Recent activity</h2><span className="micro">{data?.total??"…"} records</span></div>
      {loading?<div className="imdx-cms-empty">Loading secure audit records…</div>:data?.records.length?
        data.records.map(r=><details className="imdx-cms-audit-record" key={r.id}>
          <summary><div><strong>{r.action.replaceAll("_"," ")}</strong><small>{r.resourceType} · {r.resourceId.slice(0,12)} · {date(r.createdAt)}</small></div><span className="imdx-cms-status-chip">View changes</span></summary>
          <p className="micro">Actor: {r.adminId?"Staff "+r.adminId.slice(0,12):r.accountId?"Customer "+r.accountId.slice(0,12):"System"}</p>
          <div className="imdx-cms-audit-diff"><section><h3>Before</h3><pre>{pretty(r.beforeState)}</pre></section><section><h3>After</h3><pre>{pretty(r.afterState)}</pre></section></div>
        </details>):<div className="imdx-cms-empty">No audit events match the selected filters.</div>}
      {data&&<div className="payment-pagination">
        <button className="ghost cms-small" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button>
        <span>Page {page} / {Math.max(1,Math.ceil(data.total/data.limit))}</span>
        <button className="ghost cms-small" disabled={page*data.limit>=data.total} onClick={()=>setPage(p=>p+1)}>Next</button>
      </div>}
    </section>
  </>;
}
