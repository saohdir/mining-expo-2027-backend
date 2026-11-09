"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {CmsIcon,useCmsSession,type IconName} from "./components/CmsShell";

type Period="today"|"week"|"month"|"custom";
type Metric={key:string;label:string;value:string|number;caption:string;icon:string;accent:boolean};
/** Every dashboard card opens the list behind its number. */
const METRIC_HREF:Record<string,string>={
  action:"#cms-action-queue",account:"/admin/customers",visitor:"/admin/registrations?type=VISITOR",conference:"/admin/registrations?type=CONFERENCE",
  booth:"/admin/booths",booths:"/admin/booths",review:"/admin/booths",holds:"/admin/booths",available:"/admin/floorplans",occupied:"/admin/floorplans",
  invoice:"/admin/workspace?section=finance#cms-invoices",invoices:"/admin/workspace?section=finance#cms-invoices",issued:"/admin/workspace?section=finance#cms-invoices",total:"/admin/workspace?section=finance#cms-invoices",
  manual:"/admin/workspace?section=finance#cms-payment-requests",admitted:"/admin/reports",entries:"/admin/reports",rejected:"/admin/reports",
  programmes:"/admin/programmes",tba:"/admin/programmes"};
type Queue={type:string;reference:string;label:string;createdAt:string;href:string;action:string};
type Notification={id:string;type:string;recordId:string;createdAt:string;readAt:string|null};
type Dashboard={
  event:string;role:string;period:{preset:Period;from:string;to:string;basis:string;timezone:string};
  metrics:Metric[];queue:Queue[];notifications:Notification[];
};

function Login(){
  const {refresh}=useCmsSession();
  const [email,setEmail]=useState(""),[password,setPassword]=useState("");
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function submit(e:React.FormEvent){
    e.preventDefault();setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/admin/auth/login",{method:"POST",
        headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});
      const d=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(d.message||"Unable to sign in");
      setPassword("");
      await refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Unable to sign in")}
    finally{setBusy(false)}
  }
  return <div className="imdx-cms-auth-state">
    <p className="imdx-cms-breadcrumb">IMDX 2027 / ORGANIZER ACCESS</p>
    <CmsIcon name="shield" size={32}/>
    <h1>Welcome to <em>IMDX CMS.</em></h1>
    <p>Secure organizer workspace for registrations, exhibition operations, finance and reporting.</p>
    <form onSubmit={e=>void submit(e)} className="imdx-cms-auth-form">
      <label>Staff email<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <button disabled={busy}>{busy?"Signing in…":"Sign in to CMS"}</button>
    </form>
    {message&&<p className="notice" role="alert">{message}</p>}
    <p className="micro">Access requires an account provisioned by an authorized administrator. There is no public staff registration.</p>
  </div>;
}

const formatDay=(iso:string)=>new Date(iso).toLocaleDateString("en-GB",{timeZone:"Asia/Jakarta",day:"2-digit",month:"short",year:"numeric"});
const label=(value:string)=>value.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,x=>x.toUpperCase());
const knownIcons:IconName[]=["overview","users","tickets","booths","request","invoice","payments","floorplan","box","scan","activity","chart","calendar","file","bell","shield","settings","menu","search","close","arrow","logout","clock","check"];
const iconName=(s:string):IconName=>knownIcons.includes(s as IconName)?s as IconName:"chart";

export default function AdminOverview(){
  const {actor,loading}=useCmsSession();
  const [period,setPeriod]=useState<Period>("month");
  const [from,setFrom]=useState(""),[to,setTo]=useState("");
  const [dashboard,setDashboard]=useState<Dashboard|null>(null);
  const [fetching,setFetching]=useState(false),[error,setError]=useState("");
  const [refreshCounter,setRefreshCounter]=useState(0);
  useEffect(()=>{
    if(!actor||actor.role==="CHECKIN_STAFF")return;
    if(period==="custom"&&(!from||!to))return;
    const controller=new AbortController();
    const params=new URLSearchParams({period});
    if(period==="custom"){params.set("from",from);params.set("to",to)}
    setFetching(true);setError("");
    fetch("/api/admin/dashboard?"+params.toString(),{cache:"no-store",signal:controller.signal})
      .then(async response=>{const d=await response.json().catch(()=>({}));if(!response.ok)throw new Error(d.message||"Dashboard is unavailable");return d as Dashboard})
      .then(data=>{if(!controller.signal.aborted)setDashboard(data)})
      .catch(e=>{if(!controller.signal.aborted){setDashboard(null);setError(e instanceof Error?e.message:"Dashboard unavailable")}})
      .finally(()=>{if(!controller.signal.aborted)setFetching(false)});
    return()=>controller.abort();
  },[actor,period,from,to,refreshCounter]);
  if(loading)return <div className="imdx-cms-empty">Checking staff session…</div>;
  if(!actor)return <Login/>;
  if(actor.role==="CHECKIN_STAFF")return <div className="imdx-cms-empty">Opening assigned gate scanner…</div>;
  const scope=dashboard?.period;
  return <>
    <div className="imdx-cms-breadcrumb">IMDX 2027 <span>/</span> Organizer CMS <span>/</span> <b>Overview</b></div>
    <header className="imdx-cms-heading">
      <div><p className="eyebrow">EVENT AT A GLANCE</p>
      <h1>Good to see you.<br/><em>Here’s your overview.</em></h1>
      <p>{dashboard?.event||"IMDX 2027"} · {actor.role.replaceAll("_"," ")} dashboard · Secure operations</p></div>
      <button type="button" className="ghost cms-small" onClick={()=>setRefreshCounter(x=>x+1)} disabled={fetching}>Refresh figures</button>
    </header>
    <section className="imdx-cms-filterbar" aria-label="Dashboard period filters">
      <div className="imdx-cms-period-buttons" role="group" aria-label="Period preset">
        {([["today","Today"],["week","This week"],["month","This month"],["custom","Custom"]] as [Period,string][]).map(([value,title])=>
          <button key={value} type="button" className={"cms-period-control"+(period===value?" chosen":"")} aria-pressed={period===value} onClick={()=>setPeriod(value)}>{title}</button>)}
      </div>
      {period==="custom"&&<><label>From (WIB)<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To (WIB)<input type="date" min={from||undefined} value={to} onChange={e=>setTo(e.target.value)}/></label></>}
      <span className="imdx-cms-timezone"><CmsIcon name="clock" size={15}/> Timezone: WIB (UTC+7)</span>
    </section>
    {error&&<div className="warning" role="alert">{error}</div>}
    {period==="custom"&&(!from||!to)&&<div className="imdx-cms-empty">Select both WIB dates to load the custom report.</div>}
    {fetching&&!dashboard&&<div className="imdx-cms-empty">Loading server-aggregated figures…</div>}
    {dashboard&&<>
      <section className="imdx-cms-kpis" aria-label="Role-scoped key metrics">
        {dashboard.metrics.map(m=>{const href=METRIC_HREF[m.key];const body=<>
          <span className="imdx-cms-kpi-icon"><CmsIcon name={iconName(m.icon)} size={22}/></span>
          <strong>{typeof m.value==="number"?m.value.toLocaleString("id-ID"):m.value}</strong>
          <span className="imdx-cms-kpi-label">{m.label}</span>
          <small>{m.caption}</small>{href&&<span className="imdx-cms-kpi-more" aria-hidden="true">View details →</span>}</>;
          return href?<Link href={href} className={"imdx-cms-kpi is-link"+(m.accent?" is-feature":"")} key={m.key} aria-label={m.label+": "+m.value+" — view details"}>{body}</Link>
            :<article className={"imdx-cms-kpi"+(m.accent?" is-feature":"")} key={m.key}>{body}</article>})}
      </section>
      <p className="imdx-cms-metric-note">Figures are server aggregates for {formatDay(scope?.from||"2026-11-01")} – {formatDay(scope?.to||"2026-11-08")} (WIB). Scope: {label(actor.role)}. Measure basis is stated on each card; live inventory figures are explicitly labeled.</p>
      <div className="imdx-cms-panels">
        {actor.role!=="CONTENT_EDITOR"&&actor.role!=="VIEWER"&&<section className="imdx-cms-panel" id="cms-action-queue">
          <div className="imdx-cms-panel-title"><h2>Needs action</h2><Link href="/admin/booths">Open workspace</Link></div>
          {dashboard.queue.length?dashboard.queue.map((q,i)=><div className="imdx-cms-queue-item" key={q.reference+"-"+i}>
            <span><CmsIcon name={q.type.includes("payment")?"payments":q.type.includes("Booth")?"booths":"clock"}/></span>
            <div><strong>{q.label}</strong><small>{q.type} · Ref {q.reference} · {formatDay(q.createdAt)}</small></div>
            <Link href={q.href}>{q.action}</Link>
          </div>):<div className="imdx-cms-empty">No pending actions in this period.</div>}
        </section>}
        <section className="imdx-cms-panel">
          <div className="imdx-cms-panel-title"><h2>Notification inbox</h2><Link href="/admin/notifications">View all</Link></div>
          {dashboard.notifications.length?dashboard.notifications.map(n=><div key={n.id} className="imdx-cms-inbox-row">
            <span className={n.readAt?"is-read":""}/>
            <div><strong>{label(n.type)}</strong><small>{new Date(n.createdAt).toLocaleString("en-GB",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})} WIB</small></div>
          </div>):<div className="imdx-cms-empty">No notifications to review.</div>}
        </section>
      </div>
    </>}
  </>;
}
