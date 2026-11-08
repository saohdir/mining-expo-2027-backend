"use client";
import {useEffect,useMemo,useState} from "react";
type Invoice={id:string;number:string;status:string;paymentStatus:string;customerName:string;organization:string|null;email:string|null;bookingType:string;bookingLabel:string;totalMinor:string;paidMinor:string;outstandingMinor:string;minimumDpMinor:string;verifiedReceiptCount:number;createdAt:string};
type Payload={records:Invoice[];total:number;page:number};
const rp=(n:string)=>"Rp "+Number(n).toLocaleString("id-ID");
const labels:Record<string,string>={NOT_INVOICED:"Not invoiced",AWAITING_PAYMENT:"Pending",DP_RECEIVED:"DP received",PAID_IN_FULL:"Paid in full",CANCELLED:"Cancelled"};
const run=async(url:string,method="GET",data?:unknown)=>{const r=await fetch(url,{method,cache:"no-store",headers:data?{"Content-Type":"application/json"}:undefined,body:data?JSON.stringify(data):undefined});const result=await r.json().catch(()=>({}));if(!r.ok)throw Error(result.message||result.error||"Unable to complete action");return result};
export default function PaymentManagement(){
 const [me,setMe]=useState<{role:string;email:string}|null>(null),[payload,setPayload]=useState<Payload>({records:[],total:0,page:1}),[chosen,setChosen]=useState(""),[filter,setFilter]=useState(""),[query,setQuery]=useState(""),[search,setSearch]=useState(""),[page,setPage]=useState(1),[action,setAction]=useState(""),[amount,setAmount]=useState(""),[reference,setReference]=useState(""),[date,setDate]=useState(""),[reason,setReason]=useState(""),[confirmed,setConfirmed]=useState(false),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
 const finance=me?.role==="FINANCE"||me?.role==="SUPER_ADMIN";
 const fetchPayments=async()=>{const p=new URLSearchParams({page:String(page)});if(filter)p.set("status",filter);if(search)p.set("q",search);const d=await run("/api/admin/payments?"+p.toString());setPayload(d)};
 useEffect(()=>{let alive=true;(async()=>{try{const m=await run("/api/admin/me");if(!alive)return;setMe(m);await fetchPayments()}catch(e){if(alive)setMessage(e instanceof Error?e.message:"Unable to load payments")}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[filter,search,page]);
 const selected=useMemo(()=>payload.records.find(x=>x.id===chosen)||null,[payload,chosen]);
 const select=(id:string)=>{setChosen(id);setAction("");setAmount("");setReference("");setDate("");setReason("");setConfirmed(false);setMessage("")};
 const submit=async(e:React.FormEvent)=>{e.preventDefault();if(!selected||!finance)return;setMessage("");setSaving(true);
  try{
   if(!reason.trim()||reason.trim().length<10)throw Error("Provide at least 10 characters describing the verified decision.");
   if(action==="CANCELLED"){
    if(selected.verifiedReceiptCount)throw Error("This invoice has verified receipts. Cancellation needs a separately approved reversal/refund.");
    await run("/api/admin/invoices/"+selected.id+"/cancel","POST",{reason});
   }else if(action==="DP_RECEIVED"||action==="PAID_IN_FULL"){
    if(!["ISSUED","SENT","PARTIALLY_PAID"].includes(selected.status))throw Error("Issue the invoice before recording an incoming transfer.");
    if(!confirmed)throw Error("Confirm that Finance independently checked the actual bank credit.");
    if(!reference.trim()||reference.trim().length<4)throw Error("Enter the bank transaction reference.");
    if(!date)throw Error("Enter the bank credit date.");
    const outstanding=BigInt(selected.outstandingMinor);
    if(outstanding<=0n)throw Error("This invoice is already paid in full.");
    const credited=action==="PAID_IN_FULL"?outstanding:/^[1-9]\d*$/.test(amount)?BigInt(amount):0n;
    if(credited<=0n||credited>outstanding)throw Error("The received amount must be positive and no greater than the outstanding balance.");
    if(action==="DP_RECEIVED"&&credited===outstanding)throw Error("This amount settles the invoice. Choose Paid in full instead.");
    await run("/api/admin/invoices/"+selected.id+"/verify-transfer","POST",{amountMinor:credited.toString(),bankReference:reference.trim(),transferredAt:new Date(date+"T12:00:00+07:00").toISOString(),bankVerified:true,reason});
   }else throw Error("Select a valid status change.");
   setMessage("Payment status updated and recorded in the audit log. The customer will see the confirmed status.");
   setAction("");setAmount("");setReference("");setDate("");setReason("");setConfirmed(false);
   await fetchPayments();
  }catch(e){setMessage(e instanceof Error?e.message:"Update failed")}finally{setSaving(false)}
 };
 return <main className="portal-shell portal-payments">
 <nav className="portal-top"><a className="brandmark brandmark-image" href="/"><img src="/assets/imd-logo-orange.webp" alt="IMDX Indonesia Mining and Downstream Industries Exhibition 2027"/></a><span>IMDX 2027 / ORGANIZER CMS</span><a href="/admin">Back to dashboard ↗</a></nav>
 <header className="portal-heading cms-editorial-heading"><p className="eyebrow">04 / FINANCE OPERATIONS</p><h1>Payment <em>management.</em></h1><p>Manual bank transfer only. Manage invoice status after checking payment outside the website; no payment gateway or automatic checkout.</p></header>
 {message&&<div className="notice" role="status">{message}</div>}
 {loading?<section className="cms-panel">Loading invoices…</section>:!me?<section className="cms-panel"><p>Sign in to the CMS first.</p><a className="button-link" href="/admin">CMS sign in</a></section>:
 <>
 <div className="payment-summary" aria-label="Payment status definitions">
 {["AWAITING_PAYMENT","DP_RECEIVED","PAID_IN_FULL","CANCELLED"].map((k,i)=><div className="payment-stat" key={k}><span>0{i+1} / STATUS</span><strong>{labels[k]}</strong><small>{["Invoice issued; no confirmed funds","Partial funds verified by Finance","Outstanding balance is zero","Cancelled without unresolved receipts"][i]}</small></div>)}
 </div>
 <div className="payment-layout">
 <section className="cms-panel payment-list-panel">
 <div className="payment-heading-row"><div><p className="eyebrow">INVOICE REGISTER</p><h2>Customer payments</h2></div><small>{payload.total} records</small></div>
 <form className="payment-filter-row" onSubmit={e=>{e.preventDefault();setPage(1);setSearch(query)}}><label>Search invoice or customer<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, email or invoice number"/></label><label>Invoice status<select value={filter} onChange={e=>{setFilter(e.target.value);setPage(1)}}><option value="">All</option>{["DRAFT","ISSUED","SENT","PARTIALLY_PAID","PAID","OVERDUE","CANCELLED"].map(s=><option key={s}>{s}</option>)}</select></label><button type="submit" className="cms-small">Search ↗</button></form>
 {payload.records.length?payload.records.map(inv=><button type="button" className={"payment-record "+(chosen===inv.id?"selected":"")} key={inv.id} onClick={()=>select(inv.id)}>
 <div className="payment-record-top"><small>{inv.number}</small><span className={"payment-pill "+inv.paymentStatus.toLowerCase()}>{labels[inv.paymentStatus]||inv.paymentStatus}</span></div>
 <strong>{inv.customerName}</strong><span>{inv.bookingType} {inv.bookingLabel?"· "+inv.bookingLabel:""}</span>
 <div className="payment-record-bottom"><b>{rp(inv.totalMinor)}</b><small>Remaining {rp(inv.outstandingMinor)}</small></div></button>):
 <div className="payment-empty">No invoices found. Create and issue an invoice from the CMS finance menu first.</div>}
 <div className="payment-pagination"><button className="ghost cms-small" disabled={page===1} onClick={()=>setPage(n=>Math.max(1,n-1))}>← Previous</button><span>Page {page} / {Math.max(1,Math.ceil(payload.total/30))}</span><button className="ghost cms-small" disabled={page*30>=payload.total} onClick={()=>setPage(n=>n+1)}>Next →</button></div>
 </section>
 <section className="cms-panel payment-detail-panel">
 {!selected?<div className="payment-empty payment-placeholder"><span className="eyebrow">PAYMENT DETAIL</span><h2>Select an invoice.</h2><p>Choose a customer invoice to view the balance and update its verified payment status.</p><a href="/admin?section=finance">Create invoice in CMS ↗</a></div>:<>
 <p className="eyebrow">CUSTOMER PAYMENT DETAIL</p><h2>{selected.customerName}</h2>
 <p className="payment-subtitle">{selected.organization||selected.bookingType} · {selected.email||"No email provided"}</p>
 <div className="payment-balance-grid"><div><span>Invoice total</span><strong>{rp(selected.totalMinor)}</strong></div><div><span>Confirmed received</span><strong>{rp(selected.paidMinor)}</strong></div><div><span>Outstanding</span><strong>{rp(selected.outstandingMinor)}</strong></div></div>
 <div className="payment-current-state"><span>Current status</span><span className={"payment-pill "+selected.paymentStatus.toLowerCase()}>{labels[selected.paymentStatus]||selected.paymentStatus}</span></div>
 {finance?<form onSubmit={submit} className="payment-form">
 <h3>Update payment status</h3>
 <label>New status<select value={action} required onChange={e=>{setAction(e.target.value);setConfirmed(false)}}>
 <option value="">Choose an action</option>
 {["ISSUED","SENT","PARTIALLY_PAID"].includes(selected.status)&&BigInt(selected.outstandingMinor)>0n&&<>
 <option value="DP_RECEIVED">DP — confirm partial payment</option>
 <option value="PAID_IN_FULL">Paid in full — confirm remaining payment</option></>}
 {selected.verifiedReceiptCount===0&&["DRAFT","ISSUED","SENT","OVERDUE"].includes(selected.status)&&<option value="CANCELLED">Cancelled — cancel invoice</option>}
 </select></label>
 {(action==="DP_RECEIVED"||action==="PAID_IN_FULL")&&<>
 {action==="DP_RECEIVED"?<label>Amount actually received (IDR)<input type="number" inputMode="numeric" min="1" step="1" required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Enter verified DP amount"/></label>:<p className="payment-amount-hint">Remaining payment to record: <strong>{rp(selected.outstandingMinor)}</strong></p>}
 <div className="form-grid"><label>Bank transaction reference<input required minLength={4} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Reference on bank statement"/></label><label>Date funds received (WIB)<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label></div>
 <label className="consent payment-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} required/>I have independently checked the incoming funds in the organizer's approved bank records.</label>
 </>}
 <label>Reason / audit note<textarea required minLength={10} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why is this status being updated?"/></label>
 <button type="submit" disabled={saving||!action}>{saving?"Saving…":"Save payment status ↗"}</button>
 <p className="micro">Pending is the default until Finance verifies funds. Existing verified receipts cannot be deleted or overwritten. For a paid invoice cancellation, use the separately approved reversal/refund workflow.</p>
 </form>:<p className="warning">Read-only view. Only Finance or Super Admin may confirm manual payments.</p>}
 </>}
 </section>
 </div>
 </>}
 </main>
}
