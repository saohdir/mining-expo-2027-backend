"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {useCmsSession,CmsIcon} from "../components/CmsShell";
import CmsStatus from "../components/CmsStatus";

type RecordRow={id:string;accountId:string;type:string;status:string;customerName:string;email:string|null;createdAt:string;conference:string|null;organization?:string|null};
type Payload={total:number;page:number;limit:number;rows:RecordRow[]};
const types=["VISITOR","CONFERENCE","EXHIBITOR"];
const statuses=["DRAFT","SUBMITTED","PENDING_REVIEW","CONFIRMED","REJECTED","CANCELLED"];
const when=(value:string)=>new Date(value).toLocaleString("en-GB",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})+" WIB";

export default function RegistrationsPage(){
  const {actor}=useCmsSession();
  const [q,setQ]=useState("");
  const [search,setSearch]=useState("");
  const [type,setType]=useState(""),[status,setStatus]=useState("");
  // Deep links from dashboard cards: ?q= ?type= ?status=
  useEffect(()=>{const sp=new URLSearchParams(window.location.search);const value=sp.get("q")||"";setQ(value);setSearch(value);
    const t=sp.get("type")||"",st=sp.get("status")||"";if(types.includes(t))setType(t);if(statuses.includes(st))setStatus(st)},[]);
  const [from,setFrom]=useState(""),[to,setTo]=useState("");
  const [page,setPage]=useState(1);
  const [data,setData]=useState<Payload|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  const [reviewing,setReviewing]=useState<RecordRow|null>(null);
  const [decision,setDecision]=useState<"CONFIRMED"|"REJECTED">("CONFIRMED");
  const [reviewReason,setReviewReason]=useState("");
  const [working,setWorking]=useState(false),[feedback,setFeedback]=useState("");
  const [reloadTick,setReloadTick]=useState(0);
  const canReview=actor?.role==="OPERATIONS"||actor?.role==="SUPER_ADMIN";
  const canAct=(row:RecordRow)=>canReview&&
    !["CONFIRMED","REJECTED","CANCELLED"].includes(row.status);
  useEffect(()=>{
    const controller=new AbortController();
    const p=new URLSearchParams({page:String(page),limit:"30"});
    if(search)p.set("q",search);if(type)p.set("type",type);if(status)p.set("status",status);
    if(from)p.set("from",from);if(to)p.set("to",to);
    setLoading(true);setError("");
    fetch("/api/admin/registrations?"+p.toString(),{cache:"no-store",signal:controller.signal})
      .then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(r.status===403?"You don't have permission for this action":d.message||"Cannot load registrations");return d as Payload})
      .then(d=>{if(!controller.signal.aborted)setData(d)})
      .catch(e=>{if(!controller.signal.aborted){setError(e instanceof Error?e.message:"Unable to load");setData(null)}})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[search,type,status,from,to,page,reloadTick]);
  const review=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!reviewing||!canAct(reviewing))return;
    if(decision==="CONFIRMED"&&reviewing.type!=="CONFERENCE"){
      setFeedback("Visitor confirmation follows the visitor policy; exhibitors require booth allocation.");
      return;
    }
    setWorking(true);setFeedback("");
    try{
      const response=await fetch("/api/admin/registrations/"+reviewing.id+"/review",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({decision,reason:reviewReason.trim()})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||"Review was not accepted.");
      setFeedback("Registration "+decision.toLowerCase()+". The action was added to the audit log.");
      setReviewing(null);setReviewReason("");setReloadTick(n=>n+1);
    }catch(err){setFeedback(err instanceof Error?err.message:"Review failed")}
    finally{setWorking(false)}
  };
  const openReview=(row:RecordRow)=>{
    setReviewing(row);setDecision(row.type==="CONFERENCE"?"CONFIRMED":"REJECTED");
    setReviewReason("");setFeedback("");
  };
  const exportLink=(format:"xlsx"|"pdf")=>{
    const p=new URLSearchParams({format});if(type)p.set("type",type);if(status)p.set("status",status);
    if(search)p.set("q",search);if(from)p.set("from",from);if(to)p.set("to",to);
    return "/api/admin/reports/export?"+p.toString();
  };
  const change=(fn:()=>void)=>{fn();setPage(1)};
  return <>
    <div className="imdx-cms-breadcrumb">IMDX 2027 <span>/</span> Main <span>/</span> <b>Registrations</b></div>
    <header className="imdx-cms-heading"><div><p className="eyebrow">CUSTOMERS & REGISTRATIONS</p>
      <h1>Registration <em>registry.</em></h1>
      <p>Visitor, conference and exhibitor records. Every row is an enrollment, not a unique person.</p></div></header>
    <form className="imdx-cms-filterbar" onSubmit={e=>{e.preventDefault();change(()=>setSearch(q.trim()))}}>
      <label>Search customer or reference<input value={q} placeholder="Name, email or registration reference" onChange={e=>setQ(e.target.value)}/></label>
      <label>Registration type<select value={type} onChange={e=>change(()=>setType(e.target.value))}><option value="">All types</option>{types.map(t=><option key={t} value={t}>{t}</option>)}</select></label>
      <label>Registration status<select value={status} onChange={e=>change(()=>setStatus(e.target.value))}><option value="">All statuses</option>{statuses.map(t=><option key={t}>{t}</option>)}</select></label>
      <label>Created from (WIB)<input type="date" value={from} onChange={e=>change(()=>setFrom(e.target.value))}/></label>
      <label>Created to (WIB)<input type="date" min={from||undefined} value={to} onChange={e=>change(()=>setTo(e.target.value))}/></label>
      <button type="submit" className="cms-small">Apply filters</button>
      <button type="button" className="ghost cms-small" onClick={()=>{setQ("");setSearch("");setType("");setStatus("");setFrom("");setTo("");setPage(1)}}>Reset</button>
      <span className="imdx-cms-timezone"><CmsIcon name="clock" size={15}/> Created at · WIB (UTC+7)</span>
    </form>
    {error&&<p className="warning" role="alert">{error}</p>}
    {feedback&&<p className="notice" role="status">{feedback}</p>}
    {reviewing&&<section className="imdx-cms-panel" aria-label="Registration decision">
      <div className="imdx-cms-panel-title"><div><h2>Review registration</h2>
        <p className="micro">{reviewing.customerName||reviewing.email||"Customer"} · {reviewing.type} · {reviewing.id}</p></div>
        <button type="button" className="ghost cms-small" onClick={()=>setReviewing(null)}>Close</button>
      </div>
      <p className="micro">Conference confirmations require an approved free session or a fully Finance-verified paid invoice. Visitor and exhibitor confirmations follow their separate PRD workflows.</p>
      <form className="cms-review-form" onSubmit={e=>void review(e)}>
        <label>Decision<select value={decision} onChange={e=>setDecision(e.target.value as "CONFIRMED"|"REJECTED")}>
          {reviewing.type==="CONFERENCE"&&<option value="CONFIRMED">Confirm (policy-checked)</option>}
          <option value="REJECTED">Reject</option>
        </select></label>
        <label>Audit reason<textarea required minLength={8} maxLength={500} value={reviewReason}
          onChange={e=>setReviewReason(e.target.value)} placeholder="Explain the decision for the audit log"/></label>
        <button type="submit" disabled={working||reviewReason.trim().length<8}>
          {working?"Saving…":"Submit reviewed decision"}
        </button>
      </form>
    </section>}
    <section className="imdx-cms-panel">
      <div className="imdx-cms-panel-title">
        <div><h2>All registrations</h2><p className="micro">{data?data.total.toLocaleString("id-ID")+" matching enrollments":"Loading…"} · Server-side results</p></div>
        {actor&&["SUPER_ADMIN","OPERATIONS","SALES","FINANCE"].includes(actor.role)&&<div className="cms-row-actions">
          <a className="ghost button-link cms-small" href={exportLink("xlsx")}>Export XLSX</a>
          <a className="ghost button-link cms-small" href={exportLink("pdf")}>Export PDF</a>
        </div>}
      </div>
      {loading?<div className="imdx-cms-empty">Loading registration records…</div>:
      data?.rows.length?<div className="imdx-cms-table-frame">
        <table className="imdx-cms-table"><thead><tr><th>Reference</th><th>Customer</th><th>Type</th><th>Registration</th><th>Created (WIB)</th><th>Review</th></tr></thead>
        <tbody>{data.rows.map(row=><tr key={row.id}>
          <td><code>{row.id.slice(0,8)}</code></td><td><strong>{row.customerName||"Unnamed"}</strong><div className="micro">{row.organization||row.email||"—"}</div></td>
          <td>{row.type.toLowerCase().replace(/\b\w/g,x=>x.toUpperCase())}</td>
          <td><CmsStatus domain="Registration" value={row.status}/></td><td>{when(row.createdAt)}</td>
          <td>{canAct(row)?<button type="button" className="ghost cms-small" onClick={()=>openReview(row)}>Review</button>:
          <span className="micro">{["CONFIRMED","REJECTED","CANCELLED"].includes(row.status)?"Final state":"Read only"}</span>}
          {row.type==="CONFERENCE"&&["SUPER_ADMIN","FINANCE","SALES"].includes(actor?.role||"")&&
            <Link href={"/admin/workspace?section=finance&kind=enrollmentId&bookingId="+encodeURIComponent(row.id)+"&accountId="+encodeURIComponent(row.accountId)}> Prepare invoice</Link>}</td>
        </tr>)}</tbody></table>
        {data.rows.map(row=><div className="imdx-cms-record-mobile" key={"mobile-"+row.id}>
          <div className="imdx-cms-panel-title"><strong>{row.customerName||"Unnamed"}</strong><CmsStatus domain="Registration" value={row.status}/></div>
          <small>Ref {row.id.slice(0,8)} · {row.type}</small>
          <small>{when(row.createdAt)}</small>
          {canAct(row)?<button type="button" className="ghost cms-small" onClick={()=>openReview(row)}>Review registration</button>:<span>Read-only registration</span>}
        </div>)}
      </div>:<div className="imdx-cms-empty">No registration records for these filters.</div>}
      {data&&data.total>0&&<div className="payment-pagination">
        <button className="ghost cms-small" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Previous</button>
        <span>Page {page} / {Math.max(1,Math.ceil(data.total/data.limit))}</span>
        <button className="ghost cms-small" disabled={page*data.limit>=data.total} onClick={()=>setPage(p=>p+1)}>Next</button>
      </div>}
      <p className="micro">Exports are role-protected, audited, capped at 2,000 records and use the same created-date, type, status and search filters.</p>
    </section>
  </>;
}
