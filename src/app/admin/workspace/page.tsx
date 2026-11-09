"use client";
import {CustomerPicker} from "../components/CustomerPicker";
import {Suspense,useCallback,useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
type Dict=Record<string,unknown>;
const api=async(url:string,method="GET",body?:unknown)=>{const r=await fetch(url,{method,cache:"no-store",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.issues?.map((x:{message:string})=>x.message).join(", ")||"Action failed");return d};
const formatMoney=(v:unknown)=>"Rp "+Number(v||0).toLocaleString("id-ID");
type Admin={email:string;role:string};
type Registration={id:string;accountId:string;type:string;status:string;customerName:string;email:string|null;createdAt:string;conference:string|null};
type Booking={id:string;accountId:string;status:string;requestedAreaSqm:string;account:{email:string|null;profile?:{fullName:string}|null};createdAt:string};
type Invoice={id:string;number:string;status:string;accountId:string;totalMinor:string;minimumDpMinor:string};
type Notification={id:string;type:string;recordId:string;createdAt:string;readAt:string|null};
type PaymentRequest={id:string;status:string;accountId:string;enrollmentId:string|null;boothRequestId:string|null;account:{email:string|null;profile?:{fullName:string}|null}};
type EventPolicy={id:string;code:string;title:string;visitorOpen:boolean;published:boolean};
function AdminWorkspace(){
 const searchParams=useSearchParams();
 const requestedSection=searchParams.get("section");
 const requestedAccount=searchParams.get("accountId");
 const requestedBooking=searchParams.get("bookingId");
 const requestedKind=searchParams.get("kind");
 const [actor,setActor]=useState<Admin|null>(null),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[tab,setTab]=useState("registrations"),[busy,setBusy]=useState(false),[msg,setMsg]=useState(""),[loading,setLoading]=useState(true),[moduleErrors,setModuleErrors]=useState<string[]>([]);
 const [registrations,setRegistrations]=useState<Registration[]>([]),[bookings,setBookings]=useState<Booking[]>([]),[invoices,setInvoices]=useState<Invoice[]>([]),[requests,setRequests]=useState<PaymentRequest[]>([]),[notifications,setNotifications]=useState<Notification[]>([]),[events,setEvents]=useState<EventPolicy[]>([]),[attendance,setAttendance]=useState<Dict>({});
 const [from,setFrom]=useState(""),[to,setTo]=useState(""),[filterType,setFilterType]=useState(""),[invoiceAccount,setInvoiceAccount]=useState(""),[invoiceBooking,setInvoiceBooking]=useState(""),[invoiceKind,setInvoiceKind]=useState<"enrollmentId"|"boothRequestId">("enrollmentId"),[invoiceAmount,setInvoiceAmount]=useState(""),[invoiceDP,setInvoiceDP]=useState("0"),[invoiceTitle,setInvoiceTitle]=useState("IMDX 2027 booking");
 const reload=useCallback(async()=>{
   try{
     const user=await api("/api/admin/me");
     setActor(user);
     // The redesign shares this legacy workspace among roles. Never call
     // forbidden module APIs just to populate hidden tabs: that used to
     // display a false "Some CMS modules could not load" warning.
     const modules=[
       {key:"registrations",name:"Registrations",url:"/api/admin/registrations?limit=100",roles:["SUPER_ADMIN","SALES","FINANCE","OPERATIONS"]},
       {key:"bookings",name:"Booth requests",url:"/api/admin/booth-requests",roles:["SUPER_ADMIN","SALES","FINANCE","OPERATIONS"]},
       {key:"invoices",name:"Invoices",url:"/api/admin/invoices",roles:["SUPER_ADMIN","SALES","FINANCE"]},
       {key:"requests",name:"Payment requests",url:"/api/admin/payment-requests",roles:["SUPER_ADMIN","SALES","FINANCE"]},
       {key:"notifications",name:"Notifications",url:"/api/admin/notifications",roles:["SUPER_ADMIN","SALES","FINANCE","OPERATIONS","CONTENT_EDITOR","CHECKIN_STAFF","VIEWER"]},
       {key:"attendance",name:"Attendance",url:"/api/admin/reports/attendance",roles:["SUPER_ADMIN","SALES","FINANCE","OPERATIONS","VIEWER"]},
       {key:"events",name:"Event policies",url:"/api/admin/events",roles:["SUPER_ADMIN","OPERATIONS","CONTENT_EDITOR"]}
     ];
     const permitted=modules.filter(module=>module.roles.includes(user.role));
     const settled=await Promise.allSettled(permitted.map(module=>api(module.url)));
     const values:Record<string,any>={};
     const failures:string[]=[];
     settled.forEach((outcome,i)=>{
       if(outcome.status==="fulfilled")values[permitted[i].key]=outcome.value;
       else failures.push(permitted[i].name+": "+(outcome.reason instanceof Error?outcome.reason.message:"Request failed"));
     });
     setModuleErrors(failures);
     setRegistrations(values.registrations?.rows||[]);
     setBookings(values.bookings?.records||[]);
     setInvoices(values.invoices?.records||[]);
     setRequests(values.requests?.records||[]);
     setNotifications(values.notifications?.notifications||[]);
     setAttendance(values.attendance||{});
     setEvents(values.events?.events||[]);
   }catch(e){
     setActor(null);
     setModuleErrors([e instanceof Error?e.message:"Unable to authenticate."]);
   }finally{setLoading(false)}
 },[]);
 useEffect(()=>{void reload()},[reload]);
 useEffect(()=>{if(requestedSection&&["overview","registrations","bookings","finance","notifications","settings"].includes(requestedSection))setTab(requestedSection)},[requestedSection]);
 useEffect(()=>{
   if(requestedSection==="finance"&&requestedAccount&&requestedBooking&&
      (requestedKind==="enrollmentId"||requestedKind==="boothRequestId")){
     setInvoiceAccount(requestedAccount);
     setInvoiceBooking(requestedBooking);
     setInvoiceKind(requestedKind);
   }
 },[requestedSection,requestedAccount,requestedBooking,requestedKind]);
 const permittedTabs=[["registrations","Registrations"],["bookings","Booth Requests"],["finance","Invoices & Finance"],["notifications","Notifications"],["settings","Event Settings"]].filter(([id])=>
   id==="notifications"||
   (id==="settings"&&actor?.role==="SUPER_ADMIN")||
   (id==="finance"&&["SUPER_ADMIN","SALES","FINANCE"].includes(actor?.role||""))||
   (id==="bookings"&&["SUPER_ADMIN","SALES","OPERATIONS"].includes(actor?.role||""))||
   (id==="registrations"&&["SUPER_ADMIN","SALES","FINANCE","OPERATIONS"].includes(actor?.role||"")));
 const act=async(fn:()=>Promise<unknown>,success:string)=>{setBusy(true);setMsg("");try{await fn();setMsg(success);await reload()}catch(e){setMsg(e instanceof Error?e.message:"Action failed")}finally{setBusy(false)}};
 const chooseInvoice=(accountId:string,bookingId:string,kind:"enrollmentId"|"boothRequestId")=>{setInvoiceAccount(accountId);setInvoiceBooking(bookingId);setInvoiceKind(kind);setTab("finance")};
 const reportQuery=new URLSearchParams({...from?{from}:{},...to?{to}:{},...filterType?{type:filterType}:{}}).toString();
 return <main className="portal-shell"><nav className="portal-top"><a className="brandmark brandmark-image" href="/"><img src="/assets/imd-logo-orange.webp" alt="IMDX Indonesia Mining and Downstream Industries Exhibition 2027"/></a><span>OPERATIONS / CMS / UAT</span><a href="/account">Customer portal</a></nav>
 {loading?<section>Checking staff session…</section>:!actor?<section className="portal-auth"><p className="eyebrow">SECURE CMS ACCESS</p><h1>Organizer <em>sign in.</em></h1>
 <form onSubmit={e=>{e.preventDefault();void act(async()=>{await api("/api/admin/auth/login","POST",{email,password});setPassword("")},"Signed in.")}}>
 <label>Staff email<input required type="email" value={email} autoComplete="username" onChange={e=>setEmail(e.target.value)}/></label><label>Password<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>{busy?"Signing in…":"Sign in to CMS"}</button></form>{msg&&<p className="notice">{msg}</p>}<p className="micro">Admin accounts are provisioned securely by an authorized project operator; there is no public admin registration.</p></section>:
 <>
 <header className="imdx-cms-heading"><div><h1>{({overview:"Operations overview",registrations:"Registrations",bookings:"Booth requests",finance:"Invoices & payment requests",notifications:"Notifications",settings:"Event settings"} as Record<string,string>)[tab]||"Operations"}</h1><p>Invoice and QR actions are logged and role-protected server-side.</p></div></header>
 {msg&&<div className="notice" role="status">{msg}</div>}
 {moduleErrors.length>0&&<div className="warning" role="alert"><strong>Some CMS modules could not load:</strong><ul>{moduleErrors.map(error=><li key={error}>{error}</li>)}</ul><button type="button" className="ghost cms-small" onClick={()=>void reload()}>Retry loading modules</button></div>}
 <nav className="cms-workspace-tabs" aria-label="Operational workspace sections">
  {permittedTabs.map(([id,label])=><button type="button" key={id}
    className={tab===id?"chosen":""} aria-current={tab===id?"page":undefined}
    onClick={()=>setTab(id)}>{label}</button>)}
 </nav>
 <div className="cms-layout cms-workspace-layout"><aside className="cms-sidebar" aria-label="CMS modules">
 {[["overview","Overview"],["registrations","Registrations"],["bookings","Booth Requests"],["finance","Invoices & Finance"],["notifications","Notifications"],["settings","Event Settings"]].map(([id,label])=><button key={id} className={tab===id?"chosen":""} onClick={()=>setTab(id)}>{label}</button>)}
 <a className="button-link cms-small" href="/admin/reports">Reports &amp; Exports</a><a className="button-link cms-small" href="/admin/programmes">Programme Management</a><a className="button-link cms-small cms-payment-link" href="/admin/payments">Payment Management ↗</a><a className="button-link cms-small" href="/admin/floorplans">Floorplan Editor</a><a className="button-link cms-small" href="/admin/check-in">Gate QR Scanner</a>
 <button className="ghost" onClick={()=>void act(()=>api("/api/admin/auth/logout","POST"),"Signed out.")}>Sign out</button>
 </aside><div className="cms-panel">
 {tab==="overview"&&<><h2>Event at a glance</h2><div className="dashboard-grid">{[["Registrations",registrations.length],["Booth requests",bookings.length],["Pending invoice requests",requests.filter(x=>x.status==="NEW").length],["Unique arrivals",attendance.arrivedUnique||0],["Entry attempts",attendance.scanAttempts||0],["Issued invoices",invoices.length]].map(([label,count])=><div key={String(label)} className="stat-card"><strong style={{fontSize:32}}>{String(count)}</strong><p>{String(label)}</p></div>)}</div><p className="micro">Cards are illustrative scoped to the loaded records (first 100); attendance counts are server aggregates. No live sales are activated by this dashboard.</p></>}
 {tab==="registrations"&&<><h2>Registration registry</h2><p>Visitor, conference and exhibitor accounts. Filter by WIB submission period and export an auditable report.</p>
 <div className="form-grid"><label>From (WIB)<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To (WIB)<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>
 <label>Registration type<select value={filterType} onChange={e=>setFilterType(e.target.value)}><option value="">All</option><option>VISITOR</option><option>CONFERENCE</option><option>EXHIBITOR</option></select></label>
 <div className="cms-row-actions"><button className="cms-small" onClick={()=>void act(async()=>{const d=await api("/api/admin/registrations?limit=100"+(reportQuery?"&"+reportQuery:""));setRegistrations(d.rows)},"List refreshed.")}>Apply filters</button>
 <a className="button-link cms-small" href={"/api/admin/reports/export?format=xlsx&"+reportQuery}>Export Excel</a><a className="button-link cms-small" href={"/api/admin/reports/export?format=pdf&"+reportQuery}>Export PDF</a></div>
 <div className="cms-table-wrap"><table className="cms-table"><thead><tr><th>Created UTC</th><th>Name</th><th>Type</th><th>Status</th><th>Conference</th><th>Action</th></tr></thead><tbody>{registrations.map(r=><tr key={r.id}><td>{r.createdAt.slice(0,10)}</td><td>{r.customerName}<br/><small>{r.email}</small></td><td>{r.type}</td><td>{r.status}</td><td>{r.conference}</td><td><div className="cms-row-actions">{r.type==="CONFERENCE"&&<>
  {["SUPER_ADMIN","FINANCE","SALES"].includes(actor.role)&&<button className="cms-small" onClick={()=>chooseInvoice(r.accountId,r.id,"enrollmentId")}>Create invoice</button>}
  {["SUPER_ADMIN","OPERATIONS"].includes(actor.role)&&r.status!=="CONFIRMED"&&r.status!=="REJECTED"&&<button className="cms-small" disabled={busy} onClick={()=>void act(()=>api("/api/admin/registrations/"+r.id+"/review","POST",{decision:"CONFIRMED",reason:"Conference registration reviewed; invoice policy checked"}),"Conference registration reviewed.")}>Confirm (paid/free only)</button>}
 </>}</div></td></tr>)}</tbody></table></div></>}
 {tab==="bookings"&&<><h2>Booth requests</h2><p>All locations remain preferences until organizer approval, finance confirmation and explicit assignment.</p>
 {bookings.map(b=><div key={b.id} className="record"><div><strong>{b.account.profile?.fullName||b.account.email}</strong><p className="micro">{b.requestedAreaSqm} m² · {b.status} · {b.id.slice(0,8)}</p></div><div className="cms-row-actions">
 {b.status==="NEW"&&<button className="cms-small" disabled={busy} onClick={()=>void act(()=>api("/api/admin/booth-requests/"+b.id+"/status","POST",{status:"UNDER_REVIEW",reason:"Received and assigned for operational review"}),"Review started.")}>Start review</button>}
 {b.status==="OFFERED"&&<span className="micro">Waiting for customer acceptance</span>}
 <a href={"/admin/booths?request="+encodeURIComponent(b.id)} className="button-link cms-small">Open quotation workspace ↗</a>
 {["SUPER_ADMIN","FINANCE","SALES"].includes(actor.role)&&["ACCEPTED","WAITING_INVOICE","INVOICED"].includes(b.status)&&<button className="cms-small" onClick={()=>chooseInvoice(b.accountId,b.id,"boothRequestId")}>Prepare invoice</button>}</div></div>)}</>}
 {tab==="finance"&&<><h2>Invoice & manual bank transfer</h2><p className="micro">Payments are recorded by Finance in a dedicated, audited status screen. No online checkout.</p><a className="button-link cms-small" href="/admin/payments">Open Payment Management ↗</a><div className="cms-finance-main"><form onSubmit={e=>{e.preventDefault();void act(()=>api("/api/admin/invoices","POST",{accountId:invoiceAccount,[invoiceKind]:invoiceBooking,items:[{description:invoiceTitle,quantity:1,unitPriceMinor:invoiceAmount}],minimumDpMinor:invoiceDP}),"Invoice draft created. Finance must review and issue.")}}>
 <h3>Create draft invoice</h3><CustomerPicker accountId={invoiceAccount} bookingId={invoiceBooking} kind={invoiceKind} onChange={v=>{setInvoiceAccount(v.accountId);setInvoiceBooking(v.bookingId);setInvoiceKind(v.kind)}}/>
 <label>Description<input value={invoiceTitle} onChange={e=>setInvoiceTitle(e.target.value)}/></label><label>Invoice amount (IDR)<input required type="number" min="1" step="1" value={invoiceAmount} onChange={e=>setInvoiceAmount(e.target.value)}/></label>
 <label>Minimum DP (IDR)<input type="number" min="0" step="1" value={invoiceDP} onChange={e=>setInvoiceDP(e.target.value)}/></label><button disabled={busy||!invoiceAccount||!invoiceBooking} title={!invoiceAccount||!invoiceBooking?"Choose the customer and the booking first":undefined}>Save draft</button></form></div>

 <h3 id="cms-payment-requests">Customer payment requests</h3>{requests.map(x=><div key={x.id} className="record"><span>{x.account.profile?.fullName||x.account.email} · {x.status}</span><button className="cms-small" disabled={!x.enrollmentId&&!x.boothRequestId} onClick={()=>chooseInvoice(x.accountId,x.enrollmentId||x.boothRequestId||"",x.enrollmentId?"enrollmentId":"boothRequestId")}>Prepare invoice</button></div>)}
 <h3 id="cms-invoices">Invoices</h3><div className="cms-table-wrap"><table className="cms-table"><thead><tr><th>No.</th><th>Status</th><th>Amount IDR</th><th>Action</th></tr></thead><tbody>{invoices.map(x=><tr key={x.id}><td>{x.number}</td><td>{x.status}</td><td>{formatMoney(x.totalMinor)}</td><td className="cms-row-actions">
 {["SUPER_ADMIN","FINANCE"].includes(actor.role)&&x.status==="DRAFT"&&<button disabled={busy} className="cms-small" onClick={()=>void act(()=>api("/api/admin/invoices/"+x.id+"/issue","POST"),"Invoice issued. Customer can view it in portal.")}>Issue</button>}
 {x.status==="ISSUED"&&<button disabled={busy} className="cms-small" onClick={()=>void act(()=>api("/api/admin/invoices/"+x.id+"/send","POST",{channel:"EMAIL",reason:"Approved invoice notification to verified customer"}),"Invoice email queued for delivery.")}>Queue email</button>}
 </td></tr>)}</tbody></table></div></>}
 {tab==="notifications"&&<><h2>CMS notifications</h2>{notifications.map(n=><div className="record" key={n.id}><div><strong>{n.type}</strong><p className="micro">{n.createdAt.slice(0,16)} · Reference {n.recordId.slice(0,8)}</p></div>{!n.readAt&&<button className="cms-small" onClick={()=>void act(()=>api("/api/admin/notifications","PATCH",{id:n.id}),"Notification marked read.")}>Mark read</button>}</div>)}</>}
 {tab==="settings"&&<><h2>Event publishing controls</h2><p className="warning">Only SUPER_ADMIN can enable public registration. Do not enable for real participants until policies, legal text, SMTP, database, bank beneficiary, and UAT checks are approved.</p>
 {events.map(e=><div key={e.id} className="record"><div><strong>{e.title}</strong><p className="micro">Published: {String(e.published)} · Visitor registration: {String(e.visitorOpen)}</p></div>
 <div className="cms-row-actions">{!e.published&&<button disabled={busy} className="cms-small" onClick={()=>void act(()=>api("/api/admin/events","PATCH",{eventCode:e.code,published:true,visitorOpen:false,reason:"Administrator approved publication for controlled UAT"}),"Event published for controlled UAT.")}>Publish (no registrations)</button>}
 {e.published&&!e.visitorOpen&&<button disabled={busy} className="cms-small" onClick={()=>void act(()=>api("/api/admin/events","PATCH",{eventCode:e.code,published:true,visitorOpen:true,reason:"Controlled UAT registration policy explicitly enabled"}),"Visitor registrations enabled.")}>Enable visitor registration</button>}
 {e.visitorOpen&&<button disabled={busy} className="cms-small" onClick={()=>void act(()=>api("/api/admin/events","PATCH",{eventCode:e.code,published:e.published,visitorOpen:false,reason:"Pause visitor registration by authorized administrator"}),"Visitor registrations paused.")}>Pause registration</button>}</div></div>)}</>}
 </div></div>
 </>}</main>;
}

export default function AdminWorkspacePage(){
 return <Suspense fallback={<main className="portal-shell"><section className="cms-panel">Loading CMS workspace…</section></main>}><AdminWorkspace/></Suspense>;
}
