"use client";
import {useEffect, useMemo, useState} from "react";
import CmsStatus from "../components/CmsStatus";

type OfferedUnit = {id:string;code:string;hall:string|null;zone:string|null;areaSqm:string};
type Offer = {id:string;revision:number;offeredUnits:OfferedUnit[];offeredUnitIds:string[];offeredAreaSqm:string;quotedPriceMinor:string;acceptedAt:string|null;expiresAt:string|null;createdAt:string};
type Unit = OfferedUnit & {status:string};
type Booth = {id:string;accountId:string;status:string;requestedAreaSqm:string;preferredUnitIds:string[];invoices:{id:string;status:string}[];account:{email:string|null;profile:{fullName:string;organization:string|null}|null};floorplan:{title:string;versionNo:number;status:string;units:Unit[]};offers:Offer[];assignments:{id:string;boothUnit:{code:string;hall:string|null}}[]};
type Actor = {role:string;email:string};
type HoldView={id:string;status:string;expiresAt:string;endedAt:string|null;boothUnit:{code:string;hall:string|null}};

async function api(url:string, method="GET", body?:unknown) {
  const response = await fetch(url,{method,cache:"no-store",
    headers:body?{"Content-Type":"application/json"}:undefined,
    body:body?JSON.stringify(body):undefined});
  const value = await response.json().catch(()=>({}));
  if(!response.ok)throw Error(value.message||value.error||"Request failed");
  return value;
}
const idr=(n:string)=>"Rp "+Number(n||0).toLocaleString("id-ID");
const wib=(date:string)=>new Date(date).toLocaleString("en-GB",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})+" WIB";

export default function BoothManagement(){
  const [actor,setActor]=useState<Actor|null>(null);
  const [records,setRecords]=useState<Booth[]>([]);
  const [id,setId]=useState("");
  const [search,setSearch]=useState("");
  const [units,setUnits]=useState<string[]>([]);
  const [price,setPrice]=useState("");
  const [notes,setNotes]=useState("");
  const [expiresAt,setExpiresAt]=useState("");
  const [reason,setReason]=useState("");
  const [approved,setApproved]=useState(false);
  const [publicName,setPublicName]=useState(false);
  const [saving,setSaving]=useState(false);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const [holds,setHolds]=useState<HoldView[]>([]);
  const [holdHours,setHoldHours]=useState("24"),[holdReason,setHoldReason]=useState("");
  const selected=useMemo(()=>records.find(r=>r.id===id)||null,[records,id]);
  const canOffer=actor?.role==="SALES"||actor?.role==="OPERATIONS"||actor?.role==="SUPER_ADMIN";
  const canAssign=actor?.role==="OPERATIONS"||actor?.role==="SUPER_ADMIN";
  const latest=selected?.offers[0];
  const invoiceStatus=selected?.invoices[0]?.status;
  const paymentStatus=invoiceStatus==="PAID"?"PAID_IN_FULL":
    invoiceStatus==="PARTIALLY_PAID"?"DP_RECEIVED":
    ["ISSUED","SENT","OVERDUE"].includes(invoiceStatus||"")?"AWAITING_PAYMENT":
    invoiceStatus==="CANCELLED"?"CANCELLED":"NOT_INVOICED";
  const eligibleForQuote=selected&&["UNDER_REVIEW","OFFERED"].includes(selected.status)&&selected.floorplan.status==="PUBLISHED";
  const filtered=records.filter(r=>
    (r.account.profile?.fullName||r.account.email||"").toLowerCase().includes(search.toLowerCase())||
    r.id.toLowerCase().includes(search.toLowerCase()));

  const updateSelection=(record:Booth)=> {
    setId(record.id);
    setHolds([]);
    void api("/api/admin/booth-requests/"+record.id+"/holds").then((data:{holds:HoldView[]})=>setHolds(data.holds||[])).catch(()=>{});
    const proposal=record.offers[0]?.offeredUnitIds||record.preferredUnitIds;
    setUnits(proposal.filter(unitId=>record.floorplan.units.some(u=>u.id===unitId&&u.status==="AVAILABLE")));
    setPrice(record.offers[0]?.quotedPriceMinor||"");
    setNotes("");setExpiresAt("");setReason("");setHoldReason("");setApproved(false);setPublicName(false);setMessage("");
  };
  const load=async(preserveId?:string)=>{
    const target=preserveId||id;
    const result=await api("/api/admin/booth-requests"+(target?"?id="+encodeURIComponent(target):""));
    const next=(result.records||[]) as Booth[];
    setRecords(next);
    const current=next.find(r=>r.id===(preserveId||id))||next[0];
    if(current)updateSelection(current);else setId("");
  };
  useEffect(()=>{let alive=true;(async()=>{try{
    const person=await api("/api/admin/me");
    if(!alive)return;setActor(person);
    const target=new URLSearchParams(window.location.search).get("request");
    const result=await api("/api/admin/booth-requests"+(target?"?id="+encodeURIComponent(target):""));
    if(!alive)return;const next=(result.records||[]) as Booth[];setRecords(next);
    if(next[0])updateSelection(next[0]);
  }catch(e){if(alive)setMessage(e instanceof Error?e.message:"Unable to load CMS")}
  finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[]);
  const run=async(action:()=>Promise<unknown>,success:string)=>{
    setSaving(true);setMessage("");
    try{await action();const current=id;await load(current);setMessage(success)}
    catch(e){setMessage(e instanceof Error?e.message:"Unable to complete action")}
    finally{setSaving(false)}
  };

  const offer=async()=>{
    if(!selected||!canOffer)throw Error("Insufficient access.");
    if(!approved)throw Error("Confirm that the organizer approved the quotation.");
    if(!/^[1-9]\d*$/.test(price))throw Error("Enter the approved total quote in IDR.");
    if(!units.length)throw Error("Select at least one available booth.");
    if(reason.trim().length<8)throw Error("Provide an 8-character audit reason.");
    return api("/api/admin/booth-requests/"+selected.id+"/offer","POST",{
      offeredUnitIds:units,quotedPriceMinor:price,
      reason:reason.trim(),notes:notes.trim()||undefined,
      expiresAt:expiresAt?new Date(expiresAt+":00+07:00").toISOString():undefined
    });
  };
  const status=async(next:string)=>{
    if(!selected)throw Error("Select a request.");
    if(reason.trim().length<8)throw Error("Provide an audit reason.");
    return api("/api/admin/booth-requests/"+selected.id+"/status","POST",{status:next,reason:reason.trim()});
  };

  return <main className="portal-shell">
    <nav className="portal-top"><span>CMS / EXHIBITOR OPERATIONS</span><a href="/admin">Back to CMS ↗</a></nav>
    <header className="portal-heading"><p className="eyebrow">05 / EXHIBITOR SALES & OPERATIONS</p>
      <h1>Booth <em>management.</em></h1>
      <p>Review preferences, create organizer quotations, capture acceptance and assign available units only after verified manual payments.</p></header>
    {message&&<p className="notice" role="status">{message}</p>}
    {loading?<section className="cms-panel">Loading booth requests…</section>:!actor?
      <section className="cms-panel"><p>Sign in to your authorized CMS account first.</p><a className="button-link" href="/admin">CMS sign in</a></section>:
      <div className="booth-admin-layout">
       <section className="cms-panel">
        <h2>Requests</h2>
        <label>Search by customer or request ID<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find request"/></label>
        <p className="micro">Showing {filtered.length} of {records.length} latest records.</p>
        {filtered.map(record=><button type="button" key={record.id}
          className={"booth-admin-record"+(id===record.id?" selected":"")} onClick={()=>updateSelection(record)}>
          <span className="eyebrow">{record.status.replaceAll("_"," ")} / {record.id.slice(0,8)}</span>
          <strong>{record.account.profile?.fullName||record.account.email||"Customer"}</strong>
          <span>{record.requestedAreaSqm} m² requested · v{record.floorplan.versionNo}</span>
        </button>)}
        {filtered.length===0&&<p className="micro">No matching requests.</p>}
       </section>
       <section className="cms-panel">
        {!selected?<p>No booth requests recorded yet.</p>:<>
          <p className="eyebrow">CUSTOMER / QUOTATION REVIEW</p>
          <h2>{selected.account.profile?.fullName||selected.account.email||"Customer"}</h2>
          <p className="micro">{selected.account.profile?.organization||"Company not provided"} · Request {selected.id.slice(0,8)}</p>
          <div className="imdx-cms-booth-status-row" aria-label="Booking state by domain">
            <CmsStatus domain="Booth request" value={selected.status}/>
            <CmsStatus domain="Invoice" value={invoiceStatus||"NOT_ISSUED"}/>
            <CmsStatus domain="Payment" value={paymentStatus}/>
            <CmsStatus domain="Assignment" value={selected.assignments.length?"ASSIGNED":"NOT_ASSIGNED"}/>
          </div>
          <div className="imdx-cms-booth-compare" aria-label="Requested versus offered versus assigned booth">
            <article><span className="eyebrow">01 / REQUESTED</span><h3>{selected.requestedAreaSqm} m²</h3>
              <p>{selected.preferredUnitIds.map(unitId=>
                selected.floorplan.units.find(u=>u.id===unitId)?.code||unitId.slice(0,8)).join(", ")||"Unit preference not specified"}</p>
              <small>Floorplan v{selected.floorplan.versionNo} · Customer preference only</small>
            </article>
            <article><span className="eyebrow">02 / OFFERED</span><h3>{latest?latest.offeredAreaSqm+" m²":"TBA"}</h3>
              <p>{latest?latest.offeredUnits.map(u=>u.code).join(", "):"Awaiting organizer quotation"}</p>
              <small>{latest?idr(latest.quotedPriceMinor)+" · Revision "+latest.revision:"No confirmed quotation"}</small>
            </article>
            <article><span className="eyebrow">03 / ASSIGNED</span><h3>{selected.assignments.length?selected.assignments.length+" unit(s)":"Not assigned"}</h3>
              <p>{selected.assignments.length?selected.assignments.map(a=>a.boothUnit.code).join(", "):"Operations approval pending"}</p>
              <small>Assignment requires Finance verification and an explicit Operations action</small>
            </article>
          </div>
          <p className="micro">Requested m² is a non-binding preference, not the invoice basis. The approved offered quotation determines invoice value.</p>
          {selected.floorplan.status!=="PUBLISHED"&&<div className="warning" role="status">Floorplan was updated — these preferences may be stale. Review the map before making changes.</div>}
          {invoiceStatus==="PAID"&&!selected.assignments.length&&<div className="warning" role="status">Payment is confirmed but no unit is assigned. Operations must assign units separately.</div>}
          {latest&&<div className="imdx-cms-booth-quote-note">
            <strong>Quotation revision {latest.revision} · {idr(latest.quotedPriceMinor)}</strong>
            <span>{latest.acceptedAt?"Accepted "+wib(latest.acceptedAt):"Awaiting customer acceptance"}</span>
          </div>}
          {canAssign&&latest?.acceptedAt&&<div className="booth-hold-panel">
            <h3>Time-limited organizer holds</h3>
            <p className="micro">Only Operations can hold every unit in an accepted quotation. A hold is not payment or final assignment.</p>
            {holds.filter(h=>h.status==="ACTIVE").length>0?<div role="status">
              {holds.filter(h=>h.status==="ACTIVE").map(h=><p className="micro" key={h.id}><strong>{h.boothUnit.code}</strong> · Reserved until {wib(h.expiresAt)}</p>)}
            </div>:<p className="micro">No active holds recorded for this request.</p>}
            {["ACCEPTED","WAITING_INVOICE","INVOICED","ALLOCATION_PENDING"].includes(selected.status)&&selected.floorplan.status==="PUBLISHED"&&
              <div className="form-grid">
                <label>Hold duration (hours, max 168)<input type="number" min="1" max="168" step="1" value={holdHours} onChange={e=>setHoldHours(e.target.value)}/></label>
                <label>Hold or release reason<input value={holdReason} minLength={8} maxLength={500} onChange={e=>setHoldReason(e.target.value)}/></label>
                <button type="button" disabled={saving||holds.some(h=>h.status==="ACTIVE")||holdReason.trim().length<8} onClick={()=>void run(()=>api("/api/admin/booth-requests/"+selected.id+"/holds","POST",{expiresInHours:Number(holdHours),reason:holdReason.trim()}),"A time-limited hold was created. Customer payment remains unverified until Finance confirms it.")}>Hold quoted booths</button>
                <button type="button" className="ghost" disabled={saving||!holds.some(h=>h.status==="ACTIVE")||holdReason.trim().length<8} onClick={()=>void run(()=>api("/api/admin/booth-requests/"+selected.id+"/holds","DELETE",{reason:holdReason.trim()}),"Active holds released and inventory reconciled.")}>Release active holds</button>
              </div>}
          </div>}

          {canOffer&&eligibleForQuote&&<form onSubmit={event=>{event.preventDefault();void run(offer,"New quotation revision recorded. The customer must accept it before invoicing.")}}>
            <h3>Prepare a booth quotation</h3>
            <p className="micro">Only available units on the request floorplan can be proposed. This is not a reservation.</p>
            <div className="booth-admin-units" role="group" aria-label="Units in proposed quotation">
              {selected.floorplan.units.map(unit=><label key={unit.id} className={"booth-admin-option"+(unit.status!=="AVAILABLE"?" unavailable":"")}>
                <input type="checkbox" checked={units.includes(unit.id)} disabled={unit.status!=="AVAILABLE"}
                  onChange={e=>setUnits(current=>e.target.checked?[...current,unit.id]:current.filter(x=>x!==unit.id))}/>
                <span><strong>{unit.code}</strong><small>{unit.hall||"Hall TBA"} · {unit.areaSqm} m² · {unit.status}</small></span>
              </label>)}
            </div>
            <p className="micro">{units.length} selected unit(s). Offered physical area is calculated by the server.</p>
            <label>Organizer-approved total quotation (IDR)<input required value={price} type="number" min="1" step="1" onChange={e=>setPrice(e.target.value)}/></label>
            <label>Quotation notes<textarea maxLength={1000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional scope/terms; no bank credentials"/></label>
            <label>Offer expiry (WIB, optional)<input type="datetime-local" value={expiresAt} onChange={e=>setExpiresAt(e.target.value)}/></label>
            <label>Audit reason<textarea required minLength={8} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why these units and price?"/></label>
            <label className="consent"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/> I confirm the organizer has approved this quotation.</label>
            <button disabled={saving||!approved||units.length===0} type="submit">Send quotation revision ↗</button>
          </form>}
          {canOffer&&selected.status==="NEW"&&<button disabled={saving}
            onClick={()=>void run(()=>api("/api/admin/booth-requests/"+selected.id+"/status","POST",{status:"UNDER_REVIEW",reason:"Operations has started reviewing this request"}),"Review started.")}>Start review</button>}

          {canOffer&&["UNDER_REVIEW","OFFERED","ACCEPTED","WAITING_INVOICE"].includes(selected.status)&&<div className="booth-admin-actions">
            <h3>Additional operations</h3>
            <label>Reason for audit action<textarea minLength={8} value={reason} onChange={e=>setReason(e.target.value)}/></label>
            {selected.status==="OFFERED"&&<button className="ghost" disabled={saving} onClick={()=>void run(()=>status("UNDER_REVIEW"),"Returned to review.")}>Return to review</button>}
            {selected.status==="ACCEPTED"&&<button className="ghost" disabled={saving} onClick={()=>void run(()=>status("WAITING_INVOICE"),"Waiting for invoice.")}>Mark waiting for invoice</button>}
            {canAssign&&["ACCEPTED","WAITING_INVOICE","INVOICED","ALLOCATION_PENDING"].includes(selected.status)&&latest?.acceptedAt&&
              <div className="booth-admin-assign">
                <label className="consent"><input type="checkbox" checked={publicName} onChange={e=>setPublicName(e.target.checked)}/> Public display of approved company name (only if organizer approved)</label>
                <button disabled={saving} onClick={()=>void run(async()=>{if(reason.trim().length<8)throw Error("Provide an 8-character audit reason.");return api("/api/admin/booth-requests/"+selected.id+"/assign","POST",{reason:reason.trim(),approvedForPublic:publicName})},"Booth units assigned after finance and inventory validation.")}>Confirm assignment (Finance-gated) ↗</button>
              </div>}
          </div>}
          <p className="micro">All quotations are manually priced. Bank transfers remain offline and verified exclusively by Finance.</p>
        </>}
       </section>
      </div>}
  </main>;
}
