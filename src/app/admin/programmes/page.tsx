"use client";
import {useEffect,useMemo,useState} from "react";
type Conference={id:string;title:string;slug:string;published:boolean;feeMinor:string|null;capacity:number|null;startsAt:string|null;event:{code:string;title:string};_count:{enrollments:number}};
type FormFields={title:string;slug:string;feeMinor:string;capacity:string;startsAt:string};
const req=async(path:string,method="GET",body?:unknown)=>{const r=await fetch(path,{method,cache:"no-store",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||d.error||"Request failed");return d};
const slug=(v:string)=>v.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/g,"").trim().replace(/\s+/g,"-").slice(0,90);
const wibInput=(value:string|null)=>value?new Date(value).toLocaleString("sv-SE",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).replace(" ","T").slice(0,16):"";
const fromWib=(s:string)=>s?new Date(s+":00+07:00").toISOString():null;
const draft=(v:Conference):FormFields=>({title:v.title,slug:v.slug,feeMinor:v.feeMinor??"",capacity:v.capacity===null?"":String(v.capacity),startsAt:wibInput(v.startsAt)});
export default function ConferencesCms(){
 const [items,setItems]=useState<Conference[]>([]),[id,setId]=useState(""),[form,setForm]=useState<FormFields>({title:"",slug:"",feeMinor:"",capacity:"",startsAt:""}),[newForm,setNewForm]=useState({title:"",slug:""}),[reason,setReason]=useState(""),[approved,setApproved]=useState(false),[message,setMessage]=useState(""),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[role,setRole]=useState("");
 const selected=useMemo(()=>items.find(x=>x.id===id)||null,[items,id]);const canEdit=role==="SUPER_ADMIN"||role==="OPERATIONS";
 const load=async(preserve=true)=>{const d=await req("/api/admin/conferences");setItems(d.records||[]);const next=(d.records as Conference[]).find(x=>x.id===(preserve?id:""))||d.records[0];if(next){setId(next.id);setForm(draft(next))}};
 useEffect(()=>{(async()=>{try{const a=await req("/api/admin/me");setRole(a.role);await load(false)}catch(e){setMessage(e instanceof Error?e.message:"Unable to load")}finally{setLoading(false)}})()},[]);
 const change=(key:keyof FormFields,value:string)=>setForm(old=>({...old,[key]:value}));
 const run=async(fn:()=>Promise<void>)=>{setSaving(true);setMessage("");try{await fn();setMessage("Saved in CMS and recorded in the audit log.");await load();setReason("");setApproved(false)}catch(e){setMessage(e instanceof Error?e.message:"Unable to save")}finally{setSaving(false)}};
 const save=async(publish?:boolean)=>{
  if(!selected)return;if(reason.trim().length<8)throw Error("Please give a reason with at least 8 characters.");
  if(publish&&(!approved||form.feeMinor===""))throw Error("Before publication, explicitly confirm organizer approval and set the approved fee (0 for free).");
  const hasEnrollment=selected._count.enrollments>0;
  if(form.capacity&&!/^\d+$/.test(form.capacity))throw Error("Capacity must be a positive integer.");
  if(form.feeMinor&&!/^\d+$/.test(form.feeMinor))throw Error("Fee must be a whole number of IDR.");
  const body:Record<string,unknown>={title:form.title,startsAt:fromWib(form.startsAt),capacity:form.capacity?Number(form.capacity):null,reason:reason.trim()};
  if(!hasEnrollment){body.slug=form.slug;body.feeMinor=form.feeMinor===""?null:form.feeMinor}
  if(publish!==undefined)body.published=publish;
  await req("/api/admin/conferences/"+selected.id,"PATCH",body);
 };
 return <main className="portal-shell">
 <nav className="portal-top"><a className="brandmark brandmark-image" href="/"><img src="/assets/imd-logo-orange.webp" alt="IMDX 2027"/></a><span>IMDX 2027 / PROGRAMME CMS</span><a href="/admin">Back to dashboard ↗</a></nav>
 <header className="portal-heading"><p className="eyebrow">03 / CONFERENCES & NETWORKING</p><h1>Programme <em>management.</em></h1><p>Maintain the approved programme information for IMDX 2027. Conference dates, capacities and fees remain TBA until the organizer confirms them.</p></header>
 {message&&<div className="notice" role="status">{message}</div>}
 {loading?<section className="cms-panel">Loading programmes…</section>:<div className="program-layout">
 <section className="cms-panel program-list"><div className="payment-heading-row"><h2>Conference programmes</h2><small>{items.length} programs</small></div>
 {items.map((r,i)=><button key={r.id} type="button" onClick={()=>{setId(r.id);setForm(draft(r));setReason("");setApproved(false);setMessage("")}} className={"program-item "+(id===r.id?"selected":"")}><span className="eyebrow">{String(i+1).padStart(2,"0")} / {r.published?"PUBLISHED":"DRAFT"}</span><strong>{r.title}</strong><small>{r.startsAt?new Date(r.startsAt).toLocaleString("en-GB",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})+" WIB":"Schedule TBA"} · {r._count.enrollments} registrations</small></button>)}
 {canEdit&&<form className="program-new" onSubmit={e=>{e.preventDefault();void run(async()=>{await req("/api/admin/conferences","POST",{title:newForm.title,slug:newForm.slug,eventCode:"IMDX-2027",feeMinor:null,capacity:null,startsAt:null});setNewForm({title:"",slug:""})})}}>
 <h3>Create a draft programme</h3><label>Programme title<input required minLength={10} value={newForm.title} onChange={e=>setNewForm(f=>({...f,title:e.target.value,slug:slug(e.target.value)}))}/></label>
 <label>URL slug<input required pattern="[a-z0-9-]+" minLength={3} value={newForm.slug} onChange={e=>setNewForm(f=>({...f,slug:e.target.value}))}/></label><button disabled={saving}>Create draft ↗</button></form>}
 </section>
 <section className="cms-panel program-detail">
 {!selected?<div className="payment-empty"><h2>No programmes.</h2><p>Create an event programme draft to begin.</p></div>:<>
 <p className="eyebrow">PROGRAMME EDITOR / {selected.event.code}</p><h2>{selected.title}</h2><div className="program-metadata"><span className="payment-pill">{selected.published?"Published":"Draft"}</span><span>{selected._count.enrollments} registered participants</span></div>
 <form onSubmit={e=>{e.preventDefault();void run(()=>save())}}><div className="form-grid"><label>Programme title<input required minLength={10} maxLength={200} disabled={!canEdit} value={form.title} onChange={e=>change("title",e.target.value)}/></label>
 <label>URL slug<input disabled={!canEdit||selected._count.enrollments>0} required minLength={3} value={form.slug} onChange={e=>change("slug",e.target.value)}/></label></div>
 <div className="form-grid"><label>Date and time (WIB)<input type="datetime-local" disabled={!canEdit} value={form.startsAt} onChange={e=>change("startsAt",e.target.value)}/></label>
 <label>Capacity (blank = TBA)<input type="number" min="1" max="100000" disabled={!canEdit} value={form.capacity} onChange={e=>change("capacity",e.target.value)}/></label></div>
 <label>Approved conference fee (IDR; blank = TBA, 0 = free)<input type="number" min="0" step="1" disabled={!canEdit||selected._count.enrollments>0} value={form.feeMinor} onChange={e=>change("feeMinor",e.target.value)}/></label>
 {selected._count.enrollments>0&&<p className="warning">This conference has registrations. The fee and slug are locked to protect existing bookings.</p>}
 {canEdit&&<>
 <label>Reason for change<textarea minLength={8} required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="What has been approved or corrected?"/></label>
 <div className="program-actions"><button type="submit" disabled={saving}>Save draft changes</button>
 {!selected.published?<button type="button" className="ghost" disabled={saving||!approved} onClick={()=>void run(()=>save(true))}>Publish programme ↗</button>:<button className="ghost" type="button" disabled={saving} onClick={()=>void run(()=>save(false))}>Unpublish programme</button>}</div>
 {!selected.published&&<label className="consent program-approval"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>I confirm that the event organizer has approved the programme information, fee and publication.</label>}
 </>}
 <p className="micro">A programme can only be published after the parent event is published. Do not publish unapproved prices, capacities or schedules.</p>
 </form></>}
 </section></div>}
 </main>
}
