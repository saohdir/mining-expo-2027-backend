"use client";
import {useCallback,useEffect,useState} from "react";
import {boothFill, boothText} from "@/lib/booth-colors";
import {InvoicePanel,type CustomerInvoice} from "./InvoicePanel";
import {AccountSecurity,AttendanceHistory} from "./AccountSecurity";
import {ActionNeeded} from "./ActionNeeded";
import {AuthPanel} from "./AuthPanel";
import {BoothStaffPanel} from "./TeamPanels";
import {FeeEstimate} from "./FeeEstimate";
import {Journeys} from "./Journeys";
import {PrepChecklist,RecentUpdates,prepItems} from "./PortalHome";
import {DocumentsPanel} from "./DocumentsPanel";
import {ParticipantDetails, participantComplete, WhatsAppVerify} from "./ParticipantDetails";
type ApiError={error?:string;message?:string;issues?:{field:string;message:string}[]};
type EventRecord={id:string;code:string;title:string;startsAt:string;venue:string;conferences:{id:string;title:string;startsAt:string|null;feeMinor:string|null;capacity:number|null;remainingSeats:number|null;registrationState:"AVAILABLE"|"FULL"|"NOT_READY"}[]};
type AccountData={phone?:string|null;verifiedPhoneAt?:string|null;id:string;email:string|null;profile:{salutation?:string|null;fullName:string;organization?:string|null;jobTitle?:string|null;country?:string|null}|null;
 enrollments:{id:string;type:string;status:string;conference?:{id:string;title:string;feeMinor:string|null}|null}[];requests:CustomerBooth[];invoices:{id:string;boothRequestId:string|null;number:string;status:string;totalMinor:string}[]};
type BoothOfferView={id:string;revision:number;offeredUnits:{id:string;code:string;hall:string|null;zone:string|null;areaSqm:string}[];offeredAreaSqm:string;quotedPriceMinor:string;expiresAt:string|null;acceptedAt:string|null;createdAt:string};
type CustomerBooth={id:string;createdAt:string;status:string;requestedAreaSqm:string;preferredUnitIds:string[];holds:{id:string;expiresAt:string;boothUnit:{code:string;hall:string|null}}[];floorplan:{versionNo:number;units:{id:string;code:string;hall:string|null}[]};offers:BoothOfferView[];assignments:{boothUnit:{code:string;hall:string|null;areaSqm:string}}[]};
type Floorplan={state:string;id?:string;version?:number;title?:string;floors?:{id:string;title:string;version:number}[];canvas?:{width:number;height:number};backgroundUrl?:string;units?:{id:string;code:string;category:string;hall?:string;areaSqm:string;status:string;x:number;y:number;w:number;h:number;categoryColor?:string|null}[]};
async function request(path:string,options:RequestInit={}){const res=await fetch(path,{...options,headers:{...(options.body?{"Content-Type":"application/json"}:{}),...options.headers},cache:"no-store"});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error((data as ApiError).message||(data as ApiError).issues?.map(i=>i.message).join(", ")||"Request failed");return data;}
const send=(path:string,data:unknown)=>request(path,{method:"POST",body:JSON.stringify(data)});
const money=(v:string)=>"Rp "+Number(v).toLocaleString("id-ID",{maximumFractionDigits:0});
/** Portal sections (ids kept stable: /account?tab=visit etc. are linked from e-mails and the website). */
const SECTIONS:[string,string,string][]=[["overview","Home","home"],["visit","My pass","pass"],["conference","Conferences","mic"],["booth","Booth","booth"],["payments","Invoices","invoice"],["documents","Documents","doc"],["profile","Profile","user"]];
const MOBILE=["overview","conference","visit","booth","payments"];
function PIcon({name}:{name:string}){const d:Record<string,string>={home:"M3 11 12 4l9 7v9h-6v-6H9v6H3z",pass:"M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2",mic:"M4 5h16v11H8l-4 4zM8 9h8M8 12h5",booth:"M3 5h18v14H3zM3 10h18M10 10v9",invoice:"M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",doc:"M6 2h9l5 5v15H6zM15 2v6h5",user:"M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",out:"M10 3H4v18h6M14 7l5 5-5 5M8 12h11"};
 return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={d[name]}/></svg>}
export default function AccountPage(){
 const [me,setMe]=useState<AccountData|null>(null),[events,setEvents]=useState<EventRecord[]>([]),[plan,setPlan]=useState<Floorplan|null>(null),[invoices,setInvoices]=useState<{invoices:CustomerInvoice[]}|null>(null),[passes,setPasses]=useState<{passes:{passId:string;qrDataUrl:string;entitlement:string;manualCode:string}[]}|null>(null);
 const [loading,setLoading]=useState(true),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[mode,setMode]=useState<"register"|"login">("register"),[email,setEmail]=useState(""),[channel,setChannel]=useState<"EMAIL"|"SMS">("EMAIL"),[phone,setPhone]=useState(""),[smsAvailable,setSmsAvailable]=useState(false),[name,setName]=useState(""),[challenge,setChallenge]=useState(""),[otp,setOtp]=useState(""),[tab,setTab]=useState("overview");
 const [fHall,setFHall]=useState(""),[fZone,setFZone]=useState(""),[fAvail,setFAvail]=useState(false),[fq,setFq]=useState("");
 const [company,setCompany]=useState(""),[picName,setPicName]=useState(""),[products,setProducts]=useState(""),[location,setLocation]=useState<"INDOOR"|"OUTDOOR">("INDOOR"),[customSize,setCustomSize]=useState(""),[area,setArea]=useState("18"),[notes,setNotes]=useState(""),[chosen,setChosen]=useState<string[]>([]),[conference,setConference]=useState("");
 const reload=useCallback(async()=>{const results=await Promise.allSettled([request("/api/customer/me"),request("/api/public/events"),request("/api/public/floorplan"),request("/api/customer/invoices"),request("/api/customer/passes")]);if(results[0].status==="fulfilled")setMe(results[0].value);else setMe(null);if(results[1].status==="fulfilled")setEvents(results[1].value.events||[]);if(results[2].status==="fulfilled")setPlan(results[2].value);if(results[3].status==="fulfilled")setInvoices(results[3].value);if(results[4].status==="fulfilled")setPasses(results[4].value);setLoading(false)},[]);
 // AT-057 / NFR-31: keep the selected booth/tab across sign-in and OTP; restore once signed in.
 useEffect(()=>{try{const q=new URLSearchParams(window.location.search);const unit=q.get("request"),conf=q.get("conference"),t=q.get("tab")||(window.location.hash==="#booth"?"booth":"");if(unit||t||conf)sessionStorage.setItem("imdx-intent",JSON.stringify({unit,conf,tab:unit?"booth":conf?"conference":t}))}catch{}},[]);
 useEffect(()=>{if(!me||!plan)return;try{const raw=sessionStorage.getItem("imdx-intent");if(!raw)return;sessionStorage.removeItem("imdx-intent");const intent=JSON.parse(raw) as {unit?:string|null;conf?:string|null;tab?:string};
   if(intent.conf&&/^[0-9a-f-]{36}$/.test(intent.conf))setConference(intent.conf);
   if(intent.tab)setTab(intent.tab as typeof tab);
   if(intent.unit){const u=plan.units?.find((x:{id:string;status:string})=>x.id===intent.unit);if(u&&u.status==="AVAILABLE"){setChosen([u.id]);setMessage("Your selected booth "+(u as {code?:string}).code+" is preselected. Complete the request below — it is a preference, not a reservation.")}else setMessage("The booth you selected is no longer available. Please choose another available unit.")}}catch{}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[me,plan]);
 // Sign-in popup on the public website: /account?embed=1 is shown in an iframe; once signed in, the parent page is told where to go.
 const [embed,setEmbed]=useState(false);
 useEffect(()=>{setEmbed(new URLSearchParams(window.location.search).get("embed")==="1"&&window.parent!==window)},[]);
 useEffect(()=>{if(!embed)return;const post=(m:object)=>window.parent.postMessage({source:"imdx-account",...m},window.location.origin);
   // Report the content height (not documentElement.scrollHeight, which never drops below the iframe height) so the popup also shrinks.
   const box=document.querySelector(".auth-embed")||document.body;const ro=new ResizeObserver(()=>post({type:"size",height:Math.ceil(box.getBoundingClientRect().height)}));ro.observe(box);
   if(me){const t=new URLSearchParams(window.location.search).get("tab");post({type:"signed-in",next:"/account"+(t&&/^[a-z]+$/.test(t)?"?tab="+t:"")})}
   const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")post({type:"close"})};window.addEventListener("keydown",onKey);
   return()=>{ro.disconnect();window.removeEventListener("keydown",onKey)}},[embed,me]);
 const [registrationOpen,setRegistrationOpen]=useState(false);
 const [team,setTeam]=useState({staff:false,estimator:false});
 useEffect(()=>{void request("/api/health").then(h=>setRegistrationOpen(Boolean(h.registrationEnabled))).catch(()=>{})},[]);
 useEffect(()=>{void reload();void request("/api/public/capabilities").then(x=>{setSmsAvailable(Boolean(x.smsOtp));setTeam({staff:Boolean(x.exhibitorStaff),estimator:Boolean(x.feeEstimator)})}).catch(()=>{})},[reload]);
 async function doAction(task:()=>Promise<unknown>,success:string){setBusy(true);setMessage("");try{await task();setMessage(success);await reload()}catch(e){setMessage(e instanceof Error?e.message:"Request failed")}finally{setBusy(false)}}
 const event=events[0];
 const selectedConference=event?.conferences?.find(c=>c.id===conference);
 return <main className={"portal-shell"+(me&&!embed?" portal-app":"")}>
  {embed ? <div className="auth-embed">{loading ? <p role="status">Loading…</p> : me ? <p role="status">Signed in — opening your account…</p> : <AuthPanel registrationOpen={registrationOpen} onSignedIn={()=>void reload()}/>}</div> : <>
  <nav className="portal-top"><a className="brandmark brandmark-image" href="/"><img src="/assets/imd-logo-orange.webp" alt="IMDX Indonesia Mining and Downstream Industries Exhibition 2027"/></a><span>Customer account / UAT</span><a href="/">Back to website</a></nav>
  {loading?<section>Loading account information…</section>:!me?<div className="auth-modal-backdrop"><div className="auth-modal" role="dialog" aria-modal="true" aria-label="Sign in or create your IMDX account"><a className="auth-modal-close" href="/" aria-label="Close and go back to the website">×</a><AuthPanel registrationOpen={registrationOpen} onSignedIn={()=>void reload()}/></div></div>:<>
    {(()=>{const hasPass=Boolean(passes?.passes.length);const openInvoices=(invoices?.invoices||[]).filter(i=>["AWAITING_PAYMENT","DP_RECEIVED"].includes(i.state)).length;return <>
    <aside className="portal-side" aria-label="My IMDX">
      <p className="portal-side-title">My IMDX 2027</p>
      <div className="portal-nav" role="tablist" aria-label="Account sections" aria-orientation="vertical">{SECTIONS.map(([id,title,icon])=><button key={id} type="button" role="tab" id={"tab-"+id} aria-selected={tab===id} className={tab===id?"chosen":""} onClick={()=>setTab(id)}><PIcon name={icon}/><span>{title}</span>{id==="payments"&&openInvoices>0&&<em aria-label={openInvoices+" open"}>{openInvoices}</em>}</button>)}</div>
      <button type="button" className="portal-plain portal-pass-shortcut" onClick={()=>setTab("visit")}><PIcon name="pass"/><span><strong>{hasPass?"Show my QR pass":"Get my QR pass"}</strong><small>{hasPass?"For the gate at JIEXPO":"Register as a visitor first"}</small></span></button>
      <button type="button" className="ghost portal-signout" onClick={()=>void doAction(()=>request("/api/auth/logout",{method:"POST"}),"Signed out.")}><PIcon name="out"/>Sign out</button>
    </aside>
    <nav className="portal-bottom" aria-label="Quick navigation">{MOBILE.map(id=>{const [,title,icon]=SECTIONS.find(x=>x[0]===id)!;return <button key={id} type="button" className={"portal-plain "+(id==="visit"?"is-pass ":"")+(tab===id?"chosen":"")} aria-current={tab===id?"page":undefined} aria-label={title} onClick={()=>setTab(id)}><PIcon name={icon}/><span aria-hidden="true">{id==="visit"?"Pass":title}</span></button>})}</nav>
    </>})()}
    <div className="portal-main">
    <header className="portal-greet"><div><h1>Welcome, <em>{[me.profile?.salutation==="IBU"?"Ibu":me.profile?.salutation==="BAPAK"?"Bapak":"",me.profile?.fullName||"participant"].filter(Boolean).join(" ")}</em></h1>
      <p><span className="portal-greet-event">{event?.title||"IMDX 2027"} · </span>26–28 May 2027 · {event?.venue||"JIEXPO Kemayoran, Jakarta"}</p></div>
      <div className="portal-greet-tools"><button type="button" className="ghost portal-mobile-only" onClick={()=>setTab("profile")} aria-label="Profile"><PIcon name="user"/></button><button type="button" className="ghost portal-mobile-only" onClick={()=>setTab("documents")} aria-label="Documents"><PIcon name="doc"/></button></div></header>
    {message&&<div className="notice" role="status">{message}</div>}
    {tab==="overview"&&<>
      <ActionNeeded me={me} invoices={invoices?.invoices||[]} go={t=>setTab(t as typeof tab)}/>
      <section aria-labelledby="exp-h"><h2 id="exp-h">Event experience</h2><p className="micro">Follow each journey step by step. Payments are made by bank transfer to the account on your invoice.</p>
      <Journeys me={me} hasExpoPass={Boolean(passes?.passes.some(p=>p.entitlement==="EXPO_ENTRY"))} invoices={invoices?.invoices||[]} go={t=>setTab(t as typeof tab)}/>
      </section>
      <div className="portal-two"><PrepChecklist items={prepItems(me,Boolean(passes?.passes.some(p=>p.entitlement==="EXPO_ENTRY")),invoices?.invoices||[])} go={t=>setTab(t as typeof tab)}/><RecentUpdates go={t=>setTab(t as typeof tab)}/></div>
      </>}
    {tab==="visit"&&<section><h2>My pass</h2><p>Each visitor has a personal QR pass. Show it at the entrance gate; staff scan it to admit you.</p>
      {me.enrollments.filter(x=>x.type==="VISITOR").map(r=><div className="record" key={r.id}><strong>Visitor registration</strong><span className="status">{r.status}</span></div>)}
      {me.enrollments.every(x=>x.type!=="VISITOR")&&<ParticipantDetails p={me} onSaved={()=>void reload()} intro="Complete these details to receive your personal exhibition visitor pass."/>}
      {me.enrollments.every(x=>x.type!=="VISITOR")&&<button disabled={busy||!event||!participantComplete(me)} onClick={()=>void doAction(()=>send("/api/customer/registrations",{eventCode:event?.code,kind:"VISITOR",consent:true}),"Registration submitted.")}>Register as exhibition visitor</button>}
      {passes?.passes.length?passes.passes.map(p=><figure key={p.passId} className="pass printable-pass"><img width={220} height={220} src={p.qrDataUrl} alt={"Personal entry QR pass, "+p.entitlement}/><figcaption>Private pass · {p.entitlement} · Do not share</figcaption><p className="micro">Manual code for gate staff: <strong style={{letterSpacing:"0.12em"}}>{p.manualCode}</strong></p><div className="cms-row-actions no-print"><a href={p.qrDataUrl} download={"imdx-pass-"+p.passId.slice(0,8)+".png"}>Download QR</a><button type="button" onClick={()=>window.print()}>Print pass</button></div></figure>):<p className="micro">QR will appear after your visitor registration is eligible and confirmed.</p>}
      <AttendanceHistory/>
     </section>}
    {tab==="conference"&&<section><h2>My conferences</h2><p>Registration and payment are separate. A submitted request does not confirm payment.</p>
      {me.enrollments.filter(x=>x.type==="CONFERENCE").map(x=><div key={x.id} className="record"><div><strong>{x.conference?.title||"Conference"}</strong><span className="micro"> · {x.status}</span></div>
       {x.status==="CONFIRMED"?<span className="status">Confirmed</span>
        :x.conference?.feeMinor==="0"?<span className="micro">Free programme · awaiting organizer confirmation</span>
        :x.conference?.feeMinor===null||!x.conference?<span className="micro">Fee not approved</span>
        :["SUBMITTED","PENDING_REVIEW"].includes(x.status)?<button disabled={busy} onClick={()=>void doAction(()=>send("/api/customer/manual-payment-request",{enrollmentId:x.id}),"Finance has been notified of your invoice request.")}>Request bank-transfer invoice</button>
        :<span className="micro">No invoice action available for this status</span>}</div>)}
      {event?.conferences?.length?<ParticipantDetails p={me} onSaved={()=>void reload()} intro="Conference seats are personal: the delegate's details appear on the badge and attendance list."/>:null}
      {event?.conferences?.length?<form onSubmit={e=>{e.preventDefault();void doAction(()=>send("/api/customer/registrations",{eventCode:event.code,kind:"CONFERENCE",conferenceId:conference,consent:true}),"Conference request submitted for review.")}}>
       <label>Select conference<select required value={conference} onChange={e=>setConference(e.target.value)}><option value="">Choose an available conference</option>{event.conferences.map(c=><option key={c.id} value={c.id} disabled={c.registrationState==="NOT_READY"}>{c.title} · {c.registrationState==="FULL"?"Fully booked":c.registrationState==="NOT_READY"?"Registration not yet available":c.remainingSeats+" seats available"}</option>)}</select></label>
       {selectedConference&&<div className="conference-availability" role="status"><strong>{selectedConference.feeMinor===null?"Fee to be confirmed":selectedConference.feeMinor==="0"?"Free programme":money(selectedConference.feeMinor)}</strong>
        <span>{selectedConference.registrationState==="AVAILABLE"?selectedConference.remainingSeats+" seats currently available":selectedConference.registrationState==="FULL"?"Fully booked":"Registration pending fee and capacity approval"}</span>
        <small>{selectedConference.startsAt?new Date(selectedConference.startsAt).toLocaleString("en-GB",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})+" WIB":"Schedule TBA"}</small>
        <small>Seat counts are indicative and checked again when you submit. Payment is only confirmed by Finance.</small></div>}
       <button disabled={busy||!selectedConference||selectedConference.registrationState!=="AVAILABLE"||!participantComplete(me)}>Submit conference registration</button>
       {selectedConference?.registrationState==="FULL"&&<button type="button" className="ghost" disabled={busy} onClick={()=>void doAction(()=>send("/api/customer/waitlist",{conferenceId:selectedConference.id}),"You are on the waitlist. This is not a booking; the organizer will contact you if a seat is released.")}>Join waitlist</button>}</form>:<p>Conference registration has not been published by the organizer yet.</p>}
    </section>}
    {tab==="booth"&&<section><h2>Exhibitor booth request</h2><p>Choose preferred units on the published floorplan. Your selections are <strong>not a reservation</strong> until operations approve and assign them.</p>
     {me.requests.map(x=>{const offer=x.offers[0];return <article className="booth-customer-card" key={x.id}>
       <div className="booth-card-top"><div><p className="eyebrow">BOOTH REQUEST / {x.id.slice(0,8)}</p><h3>Requested {x.requestedAreaSqm} m²</h3></div><span className="status">{x.status.replaceAll("_"," ")}</span></div>
       <p className="micro">Preferred: {x.preferredUnitIds.map(id=>x.floorplan.units.find(u=>u.id===id)?.code||id.slice(0,8)).join(", ")} · Floorplan v{x.floorplan.versionNo}</p>
       {offer?<div className="booth-quotation"><span className="eyebrow">ORGANIZER QUOTATION / REVISION {offer.revision}</span>
        <strong>{money(offer.quotedPriceMinor)}</strong>
        <p>Offered {offer.offeredAreaSqm} m² · {offer.offeredUnits.map(u=>u.code+(u.hall?" ("+u.hall+")":"")).join(", ")}</p>
        <p className="micro">Issued {new Date(offer.createdAt).toLocaleDateString("en-GB",{timeZone:"Asia/Jakarta"})}{offer.expiresAt?" · Expires "+new Date(offer.expiresAt).toLocaleDateString("en-GB",{timeZone:"Asia/Jakarta"}):""}</p>
        {offer.acceptedAt?<p className="micro"><strong>Accepted:</strong> {new Date(offer.acceptedAt).toLocaleString("en-GB",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})} WIB</p>:<p className="micro">Offer is not a reservation. Operations will allocate only after approved payment verification.</p>}
       </div>:<p className="micro">Awaiting organizer review and quotation. Your preferred units are not held.</p>}
       {team.staff&&x.status==="CONFIRMED"&&<BoothStaffPanel boothRequestId={x.id}/>}
       {x.assignments.length>0&&<p><strong>Assigned units:</strong> {x.assignments.map(a=>a.boothUnit.code).join(", ")}</p>}
       {x.holds.filter(h=>new Date(h.expiresAt)>new Date()).length>0&&
        <p className="micro"><strong>Organizer temporary hold (not final booking):</strong> {x.holds.filter(h=>new Date(h.expiresAt)>new Date()).map(h=>h.boothUnit.code+" until "+new Date(h.expiresAt).toLocaleString("en-GB",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})+" WIB").join("; ")}. Finance still verifies all payments manually.</p>}
       {me.invoices.filter(inv=>inv.boothRequestId===x.id).map(inv=><p className="micro" key={inv.id}>
         <strong>Invoice {inv.number}:</strong> {inv.status==="PAID"?"Paid in full":inv.status==="PARTIALLY_PAID"?"DP verified":inv.status.replaceAll("_"," ")}
       </p>)}
       <details className="booth-history"><summary>Quotation & booking history</summary>
         <ol><li>Request submitted · {new Date(x.createdAt).toLocaleString("en-GB",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})} WIB</li>
         {x.offers.slice().reverse().map(revision=><li key={revision.id}>
           Revision {revision.revision} quoted · {new Date(revision.createdAt).toLocaleString("en-GB",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})} WIB
           {revision.acceptedAt?" · Accepted "+new Date(revision.acceptedAt).toLocaleString("en-GB",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})+" WIB":""}
         </li>)}</ol>
         <p className="micro">Only your quotation records are displayed. Internal staff notes and audit reasons are not published.</p>
       </details>
       <div className="cms-row-actions">
       {x.status==="OFFERED"&&offer&&!offer.acceptedAt&&<button disabled={busy||Boolean(offer.expiresAt&&new Date(offer.expiresAt)<=new Date())}
         onClick={()=>void doAction(()=>send("/api/customer/booth-requests/"+x.id+"/accept",{offerId:offer.id}),"Organizer quotation accepted. Final allocation requires verified payment.")}>Accept quotation revision {offer.revision}</button>}
       {["ACCEPTED","WAITING_INVOICE","INVOICED","ALLOCATION_PENDING"].includes(x.status)&&offer?.acceptedAt&&<button disabled={busy} onClick={()=>void doAction(()=>send("/api/customer/manual-payment-request",{boothRequestId:x.id}),"Invoice request submitted.")}>Request manual invoice</button>}
       </div></article>})}
     {plan?.state==="PUBLISHED"&&plan.canvas?<>
      <fieldset className="exhibitor-details" data-testid="exhibitor-details"><legend>1. Exhibitor details</legend>
       <div className="form-grid">
        <label>Company name<input value={company} required minLength={2} maxLength={180} autoComplete="organization" onChange={e=>setCompany(e.target.value)}/></label>
        <label>PIC name (person in charge)<input value={picName||me.profile?.fullName||""} required minLength={2} maxLength={120} onChange={e=>setPicName(e.target.value)}/></label>
       </div>
       <WhatsAppVerify p={me} label="PIC WhatsApp number" onVerified={()=>void reload()}/>
       <label>Products to display at the booth<textarea value={products} required minLength={3} maxLength={1000} placeholder="e.g. haul trucks, crushers, mine-site software" onChange={e=>setProducts(e.target.value)}/></label>
       <div className="cms-row-actions" role="radiogroup" aria-label="Booth location">
        <label className="consent"><input type="radio" name="booth-loc" checked={location==="INDOOR"} onChange={()=>{setLocation("INDOOR");setChosen([])}}/> Indoor booth</label>
        <label className="consent"><input type="radio" name="booth-loc" checked={location==="OUTDOOR"} onChange={()=>{setLocation("OUTDOOR");setChosen([])}}/> Outdoor booth</label>
       </div>
       <label>Booth size needed if not shown on the floorplan (optional)<input value={customSize} maxLength={120} placeholder="e.g. 10 × 12 m, or 120 m² outdoor demo area" onChange={e=>setCustomSize(e.target.value)}/></label>
      </fieldset>
      <h3>2. Choose preferred booths ({location==="OUTDOOR"?"outdoor":"indoor"})</h3>
      {(plan.floors?.length||0)>1&&<div className="seg floor-switch" role="group" aria-label="Floor">{plan.floors!.map(f=><button type="button" key={f.id} aria-pressed={f.id===plan.id} className={f.id===plan.id?"chosen":"ghost"} onClick={()=>{if(f.id===plan.id)return;setChosen([]);void request("/api/public/floorplan?floor="+encodeURIComponent(f.id)).then(setPlan).catch(()=>{})}}>{f.title}</button>)}</div>}
      {/* FR-138: filter the published map by hall, zone, availability and code. */}
      <div className="floorplan-toolbar" role="group" aria-label="Filter booths">
       <label>Search code<input type="search" value={fq} onChange={e=>setFq(e.target.value)}/></label>
       <label>Hall<select value={fHall} onChange={e=>setFHall(e.target.value)}><option value="">All halls</option>{[...new Set((plan.units||[]).map(u=>u.hall).filter(Boolean))].map(h=><option key={h}>{h}</option>)}</select></label>
       <label>Zone<select value={fZone} onChange={e=>setFZone(e.target.value)}><option value="">All zones</option>{[...new Set((plan.units||[]).map(u=>(u as {zone?:string}).zone).filter(Boolean))].map(z=><option key={z}>{z}</option>)}</select></label>
       <label className="consent"><input type="checkbox" checked={fAvail} onChange={e=>setFAvail(e.target.checked)}/> Available only</label>
      </div>
      <div className="floorplan-frame"><svg role="group" aria-label="Available booth preferences" viewBox={"0 0 "+plan.canvas.width+" "+plan.canvas.height}>
        <rect x={0} y={0} width={plan.canvas.width} height={plan.canvas.height} fill="#fff3e9"/>
        {(plan.units||[]).filter(u=>(/outdoor/i.test(u.hall||"")||/outdoor/i.test((u as {zone?:string}).zone||""))===(location==="OUTDOOR")&&(!fHall||u.hall===fHall)&&(!fZone||(u as {zone?:string}).zone===fZone)&&(!fAvail||u.status==="AVAILABLE")&&(!fq||u.code.toLowerCase().includes(fq.toLowerCase()))).map(u=><g key={u.id} onClick={()=>u.status==="AVAILABLE"&&setChosen(prev=>prev.includes(u.id)?prev.filter(i=>i!==u.id):[...prev,u.id])} role="button" tabIndex={u.status==="AVAILABLE"?0:-1} onKeyDown={e=>{if(e.key==="Enter"&&u.status==="AVAILABLE")setChosen(prev=>prev.includes(u.id)?prev.filter(i=>i!==u.id):[...prev,u.id])}}>
         <rect x={u.x} y={u.y} width={u.w} height={u.h} stroke="#fff" strokeWidth={3} fill={chosen.includes(u.id)?"#c2410c":boothFill(u.status,u.categoryColor)} opacity={.96}/>
         <text x={u.x+5} y={u.y+17} fontSize={13} fill={chosen.includes(u.id)?"#fff":boothText(boothFill(u.status,u.categoryColor))}>{u.code}</text></g>)}
       </svg></div>
      <p className="micro">{chosen.length} preferred booth(s) selected. Green = available; gray = unavailable; orange = selected.</p>
      <div className="booth-choices-heading"><div><h3>Choose by booth list</h3><p className="micro">Accessible alternative to the interactive map. These are preferences only; no space is held or reserved.</p></div><span className="status">{chosen.length} SELECTED</span></div>
      <div className="booth-choice-list" role="group" aria-label="Preferred booth units">
        {plan.units?.length?(plan.units||[]).filter(u=>(/outdoor/i.test(u.hall||"")||/outdoor/i.test((u as {zone?:string}).zone||""))===(location==="OUTDOOR")&&(!fHall||u.hall===fHall)&&(!fZone||(u as {zone?:string}).zone===fZone)&&(!fAvail||u.status==="AVAILABLE")&&(!fq||u.code.toLowerCase().includes(fq.toLowerCase()))).map(u=><button type="button" key={u.id}
          className={"booth-choice"+(chosen.includes(u.id)?" is-selected":"")}
          disabled={u.status!=="AVAILABLE"} aria-pressed={chosen.includes(u.id)}
          onClick={()=>setChosen(prev=>prev.includes(u.id)?prev.filter(id=>id!==u.id):[...prev,u.id])}>
          <strong>{u.code}</strong>
          <small>{u.hall||"Hall to be confirmed"} · {u.areaSqm} m²</small>
          <span>{u.status==="AVAILABLE"?(chosen.includes(u.id)?"Selected ✓":"Available"):"Unavailable"}</span>
        </button>):<p className="micro">No booth units have been published yet.</p>}
      </div>
      <form onSubmit={e=>{e.preventDefault();void doAction(()=>send("/api/customer/booth-requests",{eventCode:event?.code||"IMDX-2027",floorplanId:plan.id,preferredUnitIds:chosen,requestedAreaSqm:Number(area),company,picName:picName||me.profile?.fullName||"",products,location,...(customSize.trim()?{customSize:customSize.trim()}:{}),notes,consent:true}),"Booth preference received. Organizer will review availability.")}}>
       <h3>3. Send the request</h3><div className="form-grid"><label>Requested area (m²)<input type="number" step="0.1" min="1" max="10000" value={area} required onChange={e=>setArea(e.target.value)}/></label></div>
       {team.estimator&&<FeeEstimate area={area}/>}
       <label>Notes / preferred arrangement<textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={1000}/></label><div className="record" role="note" aria-label="Request summary"><div><strong>Review before sending</strong><p className="micro">Preferred booths: {chosen.map(id=>plan.units?.find(u=>u.id===id)?.code).filter(Boolean).join(", ")||"none selected"} · Requested area: {area} m². No price or deposit applies yet: the organizer will send a quotation; any deposit (DP) and due date appear only on your official invoice. See the <a href="/terms/" target="_blank" rel="noreferrer">registration &amp; payment terms</a>.</p></div></div><button disabled={busy||(chosen.length===0&&!customSize.trim())||!company.trim()||products.trim().length<3||!me.verifiedPhoneAt} type="submit">Submit booth request</button></form></>:<p>The organizer has not published a booth floorplan. You can return after publication.</p>}
    </section>}
    {tab==="payments"&&<section><h2>Invoices</h2><p>Pay by bank transfer to the account shown on your invoice, then send your transfer proof here. Finance checks every transfer; your status changes once the payment is verified.</p>
      {invoices?.invoices?.length?invoices.invoices.map(x=><InvoicePanel key={x.id} invoice={x} onChanged={()=>void reload()}/>):<p>No issued invoices yet. Request an invoice from your conference or booth card.</p>}
     </section>}
    {tab==="documents"&&<DocumentsPanel invoices={invoices?.invoices||[]} passes={passes?.passes||[]} exhibitor={me.requests.length>0}/>}
    {tab==="profile"&&<section><h2>My profile</h2><p>Verified email: <strong>{me.email||"—"}</strong>{me.phone?<> · Verified phone: <strong>{me.phone}</strong></>:null}</p><p className="micro">Your name is matched at the gate. If you change it after a pass was issued, ask the organizer to reissue your pass.</p><form key={me.id} onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);void doAction(()=>request("/api/customer/me",{method:"PATCH",body:JSON.stringify(Object.fromEntries(form))}),"Profile saved.")}}>
      <div className="form-grid"><label>Full name<input name="fullName" required defaultValue={me.profile?.fullName}/></label><label>Company<input name="organization" defaultValue={me.profile?.organization||""}/></label>
      <label>Job title<input name="jobTitle" defaultValue={me.profile?.jobTitle||""}/></label><label>Country<input name="country" defaultValue={me.profile?.country||"Indonesia"}/></label><label>Business updates by<select name="notifyChannel" defaultValue={(me.profile as {notifyChannel?:string}|null)?.notifyChannel||"EMAIL"}><option value="EMAIL">Email (default)</option><option value="WHATSAPP" disabled={!me.phone}>WhatsApp (verified mobile required)</option></select></label></div>
      <button disabled={busy}>Save profile</button></form><AccountSecurity smsAvailable={smsAvailable} onChanged={()=>void reload()}/></section>}
    <button type="button" className="ghost portal-mobile-only portal-signout-mobile" onClick={()=>void doAction(()=>request("/api/auth/logout",{method:"POST"}),"Signed out.")}>Sign out</button>
    </div>
  </>}
 </>}
  </main>;
}
