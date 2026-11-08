"use client";
import {useCallback,useEffect,useState} from "react";
type ApiError={error?:string;message?:string;issues?:{field:string;message:string}[]};
type EventRecord={id:string;code:string;title:string;startsAt:string;venue:string;conferences:{id:string;title:string;startsAt:string|null}[]};
type AccountData={id:string;email:string|null;profile:{fullName:string;organization?:string|null;jobTitle?:string|null;country?:string|null}|null;
 enrollments:{id:string;type:string;status:string;conference?:{title:string}|null}[];requests:{id:string;status:string;requestedAreaSqm:string;preferredUnitIds:string[];assignments:{boothUnit:{code:string;hall:string|null;areaSqm:string}}[]}[];invoices:{id:string;number:string;status:string;totalMinor:string}[]};
type Floorplan={state:string;id?:string;version?:number;title?:string;canvas?:{width:number;height:number};backgroundUrl?:string;units?:{id:string;code:string;category:string;hall?:string;areaSqm:string;status:string;x:number;y:number;w:number;h:number}[]};
async function request(path:string,options:RequestInit={}){const res=await fetch(path,{...options,headers:{...(options.body?{"Content-Type":"application/json"}:{}),...options.headers},cache:"no-store"});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error((data as ApiError).message||(data as ApiError).issues?.map(i=>i.message).join(", ")||"Request failed");return data;}
const send=(path:string,data:unknown)=>request(path,{method:"POST",body:JSON.stringify(data)});
const money=(v:string)=>"Rp "+Number(v).toLocaleString("id-ID",{maximumFractionDigits:0});
export default function AccountPage(){
 const [me,setMe]=useState<AccountData|null>(null),[events,setEvents]=useState<EventRecord[]>([]),[plan,setPlan]=useState<Floorplan|null>(null),[invoices,setInvoices]=useState<{invoices:{id:string;number:string;totalMinor:string;outstandingMinor:string;state:string;bankDetails?:{name:string;owner:string;number:string}|null}[]}|null>(null),[passes,setPasses]=useState<{passes:{passId:string;qrDataUrl:string;entitlement:string}[]}|null>(null);
 const [loading,setLoading]=useState(true),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[mode,setMode]=useState<"register"|"login">("register"),[email,setEmail]=useState(""),[channel,setChannel]=useState<"EMAIL"|"SMS">("EMAIL"),[phone,setPhone]=useState(""),[smsAvailable,setSmsAvailable]=useState(false),[name,setName]=useState(""),[challenge,setChallenge]=useState(""),[otp,setOtp]=useState(""),[tab,setTab]=useState("overview");
 const [company,setCompany]=useState(""),[area,setArea]=useState("18"),[notes,setNotes]=useState(""),[chosen,setChosen]=useState<string[]>([]),[conference,setConference]=useState("");
 const reload=useCallback(async()=>{const results=await Promise.allSettled([request("/api/customer/me"),request("/api/public/events"),request("/api/public/floorplan"),request("/api/customer/invoices"),request("/api/customer/passes")]);if(results[0].status==="fulfilled")setMe(results[0].value);else setMe(null);if(results[1].status==="fulfilled")setEvents(results[1].value.events||[]);if(results[2].status==="fulfilled")setPlan(results[2].value);if(results[3].status==="fulfilled")setInvoices(results[3].value);if(results[4].status==="fulfilled")setPasses(results[4].value);setLoading(false)},[]);
 useEffect(()=>{void reload();void request("/api/public/capabilities").then(x=>setSmsAvailable(Boolean(x.smsOtp))).catch(()=>{})},[reload]);
 async function doAction(task:()=>Promise<unknown>,success:string){setBusy(true);setMessage("");try{await task();setMessage(success);await reload()}catch(e){setMessage(e instanceof Error?e.message:"Request failed")}finally{setBusy(false)}}
 const event=events[0];
 return <main className="portal-shell">
  <nav className="portal-top"><a href="/" className="brandmark">IMDX<span>2027</span></a><span>Customer account / UAT</span><a href="/admin">Admin CMS</a></nav>
  {loading?<section>Loading account information…</section>:!me?<section className="portal-auth"><p className="eyebrow">SECURE SIGN IN</p><h1>One account.<br/><em>Three experiences.</em></h1><p>Create an account to visit the exhibition, attend a conference and request exhibition space.</p>
    {!challenge?<form onSubmit={e=>{e.preventDefault();void doAction(async()=>{const r=await send("/api/auth/request-otp",{mode,channel,...(channel==="EMAIL"?{email}:{phone}), ...(mode==="register"?{fullName:name,consent:true,consentVersion:"v1.4-UAT"}:{})});setChallenge(r.challengeId||"")},"Verification code requested.")}}>
      <div className="tabline"><button type="button" className={mode==="register"?"chosen":""} onClick={()=>setMode("register")}>Create account</button><button type="button" className={mode==="login"?"chosen":""} onClick={()=>setMode("login")}>Sign in</button></div>
      {mode==="register"&&<label>Full name<input required value={name} onChange={e=>setName(e.target.value)} minLength={2}/></label>}
      <label>Verification channel<select value={channel} onChange={e=>setChannel(e.target.value as "EMAIL"|"SMS")}><option value="EMAIL">Email OTP</option><option value="SMS" disabled={!smsAvailable}>SMS OTP {!smsAvailable?"(not configured)":""}</option></select></label>
      {channel==="EMAIL"?<label>Email address<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>:<label>Mobile phone (+62...)<input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+628123456789"/></label>}
      <p className="micro">OTP expires in five minutes. SMS is offered only after the approved provider is configured.</p>
      <label className="consent"><input type="checkbox" required/> I agree to the privacy and registration terms for UAT testing.</label>
      <button disabled={busy} type="submit">{busy?"Requesting…":"Send verification code"}</button>
    </form>:<form onSubmit={e=>{e.preventDefault();void doAction(async()=>{await send("/api/auth/verify-otp",{challengeId:challenge,code:otp});setChallenge("")},"Account verified.")}}>
     <label>6-digit verification code<input value={otp} pattern="[0-9]{6}" inputMode="numeric" onChange={e=>setOtp(e.target.value)} required/></label><button disabled={busy} type="submit">Verify & sign in</button><button type="button" className="ghost" onClick={()=>setChallenge("")}>Change contact</button>
    </form>}
   {message&&<div className="notice" role="status">{message}</div>}
  </section>:<>
    <header className="portal-heading"><p className="eyebrow">ACCOUNT DASHBOARD / IMDX 2027</p><h1>Welcome, <em>{me.profile?.fullName||"participant"}</em></h1><p>Manage your exhibition visit, conference booking and booth requests from one account.</p></header>
    <div className="tabline portal-tabs">{[["overview","Overview"],["visit","Exhibition visitor"],["conference","Conferences"],["booth","My booth"],["payments","Invoices & payments"],["profile","Profile"]].map(([id,title])=><button key={id} className={tab===id?"chosen":""} onClick={()=>setTab(id)}>{title}</button>)}</div>
    {message&&<div className="notice" role="status">{message}</div>}
    {tab==="overview"&&<section><h2>Event experience</h2><p><strong>{event?.title||"IMDX 2027"}</strong> · {event?.venue||"JIEXPO Kemayoran, Jakarta"} · 26–28 May 2027</p><div className="dashboard-grid">
      <article><h3>Visit exhibition</h3><p>Get your personal entry QR after registration is confirmed.</p><button onClick={()=>setTab("visit")}>Register / view pass ↗</button></article>
      <article><h3>Join conference</h3><p>Conference registrations use manual invoices, not payment gateways.</p><button onClick={()=>setTab("conference")}>Explore conferences ↗</button></article>
      <article><h3>Reserve booth</h3><p>Choose preferred booth units; final allocation requires organizer approval.</p><button onClick={()=>setTab("booth")}>View floorplan ↗</button></article>
      </div></section>}
    {tab==="visit"&&<section><h2>Exhibition visitor</h2><p>Each visitor has a unique QR pass. At the event, the organizer checks admission in the secured CMS.</p>
      {me.enrollments.filter(x=>x.type==="VISITOR").map(r=><div className="record" key={r.id}><strong>Visitor registration</strong><span className="status">{r.status}</span></div>)}
      {me.enrollments.every(x=>x.type!=="VISITOR")&&<button disabled={busy||!event} onClick={()=>void doAction(()=>send("/api/customer/registrations",{eventCode:event?.code,kind:"VISITOR",consent:true}),"Registration submitted.")}>Register as exhibition visitor</button>}
      {passes?.passes.length?passes.passes.map(p=><figure key={p.passId} className="pass"><img width={220} height={220} src={p.qrDataUrl} alt="Personal entry QR pass"/><figcaption>Private pass · {p.entitlement} · Do not share</figcaption></figure>):<p className="micro">QR will appear after your visitor registration is eligible and confirmed.</p>}
     </section>}
    {tab==="conference"&&<section><h2>My conferences</h2><p>Registration and payment are separate. A submitted request does not confirm payment.</p>
      {me.enrollments.filter(x=>x.type==="CONFERENCE").map(x=><div key={x.id} className="record"><div><strong>{x.conference?.title||"Conference"}</strong><span className="micro"> · {x.status}</span></div><button disabled={busy} onClick={()=>void doAction(()=>send("/api/customer/manual-payment-request",{enrollmentId:x.id}),"Finance has been notified of your invoice request.")}>Request bank-transfer invoice</button></div>)}
      {event?.conferences?.length?<form onSubmit={e=>{e.preventDefault();void doAction(()=>send("/api/customer/registrations",{eventCode:event.code,kind:"CONFERENCE",conferenceId:conference,consent:true}),"Conference request submitted for review.")}}>
       <label>Select conference<select required value={conference} onChange={e=>setConference(e.target.value)}><option value="">Choose an available conference</option>{event.conferences.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label><button disabled={busy||!conference}>Submit conference registration</button></form>:<p>Conference registration has not been published by the organizer yet.</p>}
    </section>}
    {tab==="booth"&&<section><h2>Exhibitor booth request</h2><p>Choose preferred units on the published floorplan. Your selections are <strong>not a reservation</strong> until operations approve and assign them.</p>
     {me.requests.map(x=><div className="record" key={x.id}><div><strong>{x.requestedAreaSqm} m² requested</strong><p className="micro">Request {x.id.slice(0,8)} · {x.status}{x.assignments?.length?" · Assigned: "+x.assignments.map(a=>a.boothUnit.code).join(", "):""}</p></div><button disabled={busy} onClick={()=>void doAction(()=>send("/api/customer/manual-payment-request",{boothRequestId:x.id}),"Invoice request submitted.")}>Request invoice</button></div>)}
     {plan?.state==="PUBLISHED"&&plan.canvas?<>
      <div className="floorplan-frame"><svg role="group" aria-label="Available booth preferences" viewBox={"0 0 "+plan.canvas.width+" "+plan.canvas.height}>
        <rect x={0} y={0} width={plan.canvas.width} height={plan.canvas.height} fill="#fff3e9"/>
        {plan.units?.map(u=><g key={u.id} onClick={()=>u.status==="AVAILABLE"&&setChosen(prev=>prev.includes(u.id)?prev.filter(i=>i!==u.id):[...prev,u.id])} role="button" tabIndex={u.status==="AVAILABLE"?0:-1} onKeyDown={e=>{if(e.key==="Enter"&&u.status==="AVAILABLE")setChosen(prev=>prev.includes(u.id)?prev.filter(i=>i!==u.id):[...prev,u.id])}}>
         <rect x={u.x} y={u.y} width={u.w} height={u.h} stroke="#fff" strokeWidth={3} fill={chosen.includes(u.id)?"#ff5912":u.status==="AVAILABLE"?"#96d8c4":"#bbb"} opacity={.96}/>
         <text x={u.x+5} y={u.y+17} fontSize={13} fill="#351109">{u.code}</text></g>)}
       </svg></div>
      <p className="micro">{chosen.length} preferred booth(s) selected. Green = available; gray = unavailable; orange = selected.</p>
      <form onSubmit={e=>{e.preventDefault();void doAction(()=>send("/api/customer/booth-requests",{eventCode:event?.code||"IMDX-2027",floorplanId:plan.id,preferredUnitIds:chosen,requestedAreaSqm:Number(area),company,notes,consent:true}),"Booth preference received. Organizer will review availability.")}}>
       <div className="form-grid"><label>Company name<input value={company} required minLength={2} onChange={e=>setCompany(e.target.value)}/></label><label>Requested area (m²)<input type="number" step="0.1" min="1" max="10000" value={area} required onChange={e=>setArea(e.target.value)}/></label></div>
       <label>Notes / preferred arrangement<textarea value={notes} onChange={e=>setNotes(e.target.value)} maxLength={1000}/></label><button disabled={busy||chosen.length===0} type="submit">Submit booth request</button></form></>:<p>The organizer has not published a booth floorplan. You can return after publication.</p>}
    </section>}
    {tab==="payments"&&<section><h2>Invoices & bank transfer</h2><p>No Midtrans or automated payment gateway. Only verified organizer bank transfers change your paid status.</p>
      {invoices?.invoices?.length?invoices.invoices.map(x=><div className="record" key={x.id}><div><strong>{x.number}</strong><p className="micro">Total {money(x.totalMinor)} · Outstanding {money(x.outstandingMinor)}</p>
        {x.bankDetails&&<p className="micro"><strong>Approved transfer destination</strong>: {x.bankDetails.name} · {x.bankDetails.owner} · {x.bankDetails.number}</p>}
        <a href={"/api/customer/invoices/"+x.id+"/pdf"} target="_blank" rel="noreferrer">Download invoice PDF</a></div>
        <span className="status">{x.state==="DP_RECEIVED"?"DP received":x.state==="PAID_IN_FULL"?"Paid in full":x.state==="CANCELLED"?"Cancelled":x.state}</span></div>):<p>No issued invoices yet. Request an invoice from your conference or booth card.</p>}
     </section>}
    {tab==="profile"&&<section><h2>My profile</h2><p>Verified email: <strong>{me.email}</strong></p><form key={me.id} onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);void doAction(()=>request("/api/customer/me",{method:"PATCH",body:JSON.stringify(Object.fromEntries(form))}),"Profile saved.")}}>
      <div className="form-grid"><label>Full name<input name="fullName" required defaultValue={me.profile?.fullName}/></label><label>Company<input name="organization" defaultValue={me.profile?.organization||""}/></label>
      <label>Job title<input name="jobTitle" defaultValue={me.profile?.jobTitle||""}/></label><label>Country<input name="country" defaultValue={me.profile?.country||"Indonesia"}/></label></div>
      <button disabled={busy}>Save profile</button></form></section>}
    <div className="portal-footer-actions"><button className="ghost" onClick={()=>void doAction(()=>request("/api/auth/logout",{method:"POST"}),"Signed out.")}>Sign out</button></div>
  </>}
 </main>;
}
