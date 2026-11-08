"use client";
import {useCallback,useEffect,useState} from "react";
import {useCmsSession,CmsIcon} from "../components/CmsShell";

type Note={id:string;type:string;recordType:string;recordId:string;readAt:string|null;createdAt:string};
type Outbox={id:string;topic:string;state:string;attempts:number;createdAt:string;nextRunAt:string};
const date=(v:string)=>new Date(v).toLocaleString("en-GB",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})+" WIB";
const label=(s:string)=>s.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
export default function NotificationsPage(){
  const {actor}=useCmsSession();
  const [notes,setNotes]=useState<Note[]>([]),[outbox,setOutbox]=useState<Outbox[]>([]);
  const [tab,setTab]=useState<"all"|"unread"|"diagnostics">("all");
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState("");
  const canInspect=actor?.role==="SUPER_ADMIN"||actor?.role==="OPERATIONS";
  const reload=useCallback(async()=>{
    setError("");
    try{
      const [r,o]=await Promise.all([
        fetch("/api/admin/notifications",{cache:"no-store"}),
        canInspect?fetch("/api/admin/notification-deliveries",{cache:"no-store"}):Promise.resolve(null)
      ]);
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw Error(data.message||"Notifications unavailable");
      setNotes(data.notifications||[]);
      if(o?.ok)setOutbox((await o.json()).records||[]);
    }catch(e){setError(e instanceof Error?e.message:"Cannot load notifications")}
    finally{setLoading(false)}
  },[canInspect]);
  useEffect(()=>{void reload()},[reload]);
  const read=async(ids:string[])=>{
    if(!ids.length||saving)return;
    setSaving(true);setError("");
    try{
      const response=await fetch("/api/admin/notifications",{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(ids.length===1?{id:ids[0]}:{ids})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.message||"Unable to update notifications.");
      await reload();
    }catch(e){setError(e instanceof Error?e.message:"Unable to update")}
    finally{setSaving(false)}
  };
  const filtered=notes.filter(n=>tab!=="unread"||!n.readAt);
  const unread=notes.filter(n=>!n.readAt);
  return <>
    <div className="imdx-cms-breadcrumb">IMDX 2027 <span>/</span> System <span>/</span> <b>Notifications</b></div>
    <header className="imdx-cms-heading"><div><p className="eyebrow">OPERATIONS INBOX</p><h1>Notifications <em>& delivery.</em></h1>
      <p>Review role-scoped alerts and delivery diagnostics. Failed emails do not undo saved customer requests.</p></div></header>
    <div className="imdx-cms-tabs" role="group" aria-label="Notifications view">
      <button className={"cms-filter-tab"+(tab==="all"?" chosen":"")} onClick={()=>setTab("all")}>All notifications</button>
      <button className={"cms-filter-tab"+(tab==="unread"?" chosen":"")} onClick={()=>setTab("unread")}>Unread ({unread.length})</button>
      {canInspect&&<button className={"cms-filter-tab"+(tab==="diagnostics"?" chosen":"")} onClick={()=>setTab("diagnostics")}>Delivery diagnostics</button>}
    </div>
    {error&&<div className="warning" role="alert">{error}</div>}
    <section className="imdx-cms-panel">
      {tab==="diagnostics"&&canInspect?<>
        <div className="imdx-cms-panel-title"><h2>Delivery outbox</h2><span className="micro">{outbox.length} recent events</span></div>
        <p className="micro">Delivery attempts are handled by a background worker. Manual retry is not yet enabled because it requires an audited authorization workflow.</p>
        {outbox.length?outbox.map(job=><div key={job.id} className="imdx-cms-inbox-list-row">
          <div><strong>{label(job.topic)}</strong><small>{date(job.createdAt)} · Attempt {job.attempts}</small></div>
          <span className="imdx-cms-status-chip" data-tone={job.state==="SENT"?"positive":job.state==="FAILED"?"negative":"waiting"}>Delivery: {label(job.state)}</span>
        </div>):<div className="imdx-cms-empty">No delivery events recorded.</div>}
      </>:<>
        <div className="imdx-cms-panel-title"><h2>Inbox</h2>
          <button type="button" className="ghost cms-small" disabled={!unread.length||saving} onClick={()=>void read(unread.map(n=>n.id))}>Mark all as read</button></div>
        {loading?<div className="imdx-cms-empty">Loading alerts…</div>:filtered.length?filtered.map(note=>
          <div key={note.id} className="imdx-cms-inbox-list-row">
            <div><strong>{label(note.type)}</strong><small>{note.recordType} · Ref {note.recordId.slice(0,8)} · {date(note.createdAt)}</small></div>
            <div className="cms-row-actions"><span className="imdx-cms-status-chip" data-tone={note.readAt?"neutral":"action"}>{note.readAt?"Read":"Unread"}</span>
              {!note.readAt&&<button type="button" className="ghost cms-small" disabled={saving} onClick={()=>void read([note.id])}>Mark read</button>}
            </div>
          </div>):<div className="imdx-cms-empty">No notifications in this view.</div>}
      </>}
    </section>
  </>;
}
