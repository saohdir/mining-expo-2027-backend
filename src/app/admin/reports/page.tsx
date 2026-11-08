"use client";
import {useEffect,useState} from "react";
import {useCmsSession} from "../components/CmsShell";
type Attendance={event:string;registeredUnique:number;eligibleUnique:number;arrivedUnique:number;admissionEntries:number;scanAttempts:number;byGate:{gate:string;count:number}[]};
const get=async(url:string)=>{const res=await fetch(url,{cache:"no-store"});const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.message||data.error||"Report is unavailable");return data};
export default function Reports(){
 const {actor}=useCmsSession();
 const canExport=actor&&["SUPER_ADMIN","OPERATIONS","SALES","FINANCE"].includes(actor.role);
 const [data,setData]=useState<Attendance|null>(null),[day,setDay]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState(""),[type,setType]=useState(""),[loading,setLoading]=useState(true),[message,setMessage]=useState("");
 const reload=async(selectedDay:string)=>{setLoading(true);setMessage("");try{const params=new URLSearchParams();if(selectedDay)params.set("day",selectedDay);const next=await get("/api/admin/reports/attendance?"+params.toString());setData(next)}catch(e){setData(null);setMessage(e instanceof Error?e.message:"Failed to load")}finally{setLoading(false)}};
 useEffect(()=>{void reload("")},[]);
 const exportUrl=(format:"pdf"|"xlsx")=>{const args=new URLSearchParams({format});if(from)args.set("from",from);if(to)args.set("to",to);if(type)args.set("type",type);return "/api/admin/reports/export?"+args.toString()};
 const metrics=data?[["Visitor registrations",data.registeredUnique,"Unique accounts with visitor registration · all time"],["Eligible accounts",data.eligibleUnique,"Accounts with confirmed registrations · all time"],["Unique arrivals",data.arrivedUnique,day?"Attended on "+day+" (WIB)":"Attended at least once"],["Admissions",data.admissionEntries,"Successful gate/zone entries"],["QR scan attempts",data.scanAttempts,"Including rejected and repeated attempts"]]:[];
 return <main className="portal-shell">
 <nav className="portal-top"><a className="brandmark brandmark-image" href="/"><img src="/assets/imd-logo-orange.webp" alt="IMDX 2027"/></a><span>IMDX 2027 / REPORTS CMS</span><a href="/admin">Back to dashboard ↗</a></nav>
 <header className="portal-heading"><p className="eyebrow">05 / EVENT ANALYTICS</p><h1>Registration &amp; <em>attendance.</em></h1><p>Compare registrations with real gate attendance. Unique people and scan attempts are tracked separately, and exports use an explicit WIB submission period.</p></header>
 {message&&<div className="notice" role="alert">{message}</div>}
 <section className="cms-panel reports-surface">
 <div className="reports-toolbar"><div><p className="eyebrow">ATTENDANCE MONITOR</p><h2>Event overview</h2></div><label>Attendance date (WIB)<input type="date" value={day} onChange={e=>{setDay(e.target.value);void reload(e.target.value)}}/></label></div>
 <p className="micro">Registered and eligible counts refer to the entire event; attendance and scan counts follow the selected date. Leave the date blank for event-wide totals.</p>
 {loading?<div className="payment-empty">Loading secure event aggregates…</div>:data&&<>
 <div className="reports-grid">{metrics.map(([label,count,detail])=><article className="report-metric" key={String(label)}><span className="eyebrow">{label}</span><strong>{Number(count).toLocaleString("id-ID")}</strong><small>{detail}</small></article>)}</div>
 <h3>Admissions by gate</h3>
 {data.byGate?.length?<div className="cms-table-wrap"><table className="cms-table"><thead><tr><th>Gate</th><th>Successful entries</th></tr></thead><tbody>{data.byGate.map(x=><tr key={x.gate}><td>{x.gate}</td><td>{x.count.toLocaleString("id-ID")}</td></tr>)}</tbody></table></div>:<p className="payment-empty">No checked-in visitors for the selected period.</p>}
 </>}
 </section>
 <section className="cms-panel reports-surface"><p className="eyebrow">SECURE DATA EXPORT</p><h2>Registration registry export</h2>
 <p>Download permitted visitor, conference and exhibitor registrations. Export uses registration creation date (WIB), not payment date or attendance time.</p>
 <div className="form-grid"><label>From (WIB)<input type="date" value={from} max={to||undefined} onChange={e=>setFrom(e.target.value)}/></label><label>To (WIB)<input type="date" value={to} min={from||undefined} onChange={e=>setTo(e.target.value)}/></label></div>
 <label>Registration type<select value={type} onChange={e=>setType(e.target.value)}><option value="">All registration types</option><option value="VISITOR">Exhibition visitors</option><option value="CONFERENCE">Conference delegates</option><option value="EXHIBITOR">Exhibitor contacts</option></select></label>
 <div className="reports-export-actions">{canExport?<><a className="button-link" href={exportUrl("xlsx")}>Download Excel ↗</a><a className="button-link ghost-link" href={exportUrl("pdf")}>Download PDF ↗</a></>:<span className="micro">This role can view approved aggregates but cannot export registration details.</span>}</div>
 <p className="micro">Exports are available only to authorized staff, logged in the audit trail and currently limited to 2,000 records per request. Narrow the date range if needed. Do not share exports publicly.</p>
 </section>
 </main>
}
