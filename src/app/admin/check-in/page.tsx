"use client";
import {useEffect,useRef,useState} from "react";
type Scan={result:string;message:string;person?:{name:string;uniqueId:string;access:string}};
export default function CheckInPage(){
 const [value,setValue]=useState(""),[gate,setGate]=useState(""),[zone,setZone]=useState(""),[scanning,setScanning]=useState(false),[result,setResult]=useState<Scan|null>(null),[error,setError]=useState(""),[working,setWorking]=useState(false);
 const clientRef=useRef<{stop:()=>Promise<unknown>;clear:()=>void}|null>(null);
 // Camera callback can fire multiple times before React renders `working`.
 // A synchronous ref lock prevents duplicate requests/attendance scans.
 const scanLock=useRef(false);
 const [errorTitle,setErrorTitle]=useState("Validation unavailable — no entry decision");
 async function check(token:string){
   if(!token.trim()||scanLock.current)return;
   if(!gate.trim()||!zone){
     setErrorTitle("Gate selection required");
     setError("Choose the approved gate and access zone before scanning.");
     return;
   }
   scanLock.current=true;setWorking(true);setResult(null);setError("");
   try{
     const response=await fetch("/api/admin/check-in/scan",{
       method:"POST",headers:{"Content-Type":"application/json"},
       body:JSON.stringify({token:token.trim(),gate,zone})
     });
     const data=await response.json().catch(()=>({}));
     // The API deliberately returns HTTP 422 for invalid/duplicate passes,
     // but still supplies the authoritative admission decision.
     if(data.result&&[
       "VALID_ACCEPTED","ALREADY_CHECKED_IN","WRONG_ZONE","NOT_YET_VALID",
       "EXPIRED","REVOKED","UNPAID","INVALID"
     ].includes(data.result)){
       setResult(data as Scan);setValue("");
     }else{
       setErrorTitle(response.status===401||response.status===403?
         "Staff access denied — no entry decision":
         response.status===503?"Admission service unavailable — no entry decision":
         "Validation unavailable — no entry decision");
       setError(data.message||data.error||"Could not validate this pass. No admission was granted.");
     }
   }catch(e){
     setErrorTitle("Connection unavailable — no entry decision");
     setError(e instanceof Error?e.message:"Unable to reach the validation server.");
   }finally{
     // Scan one pass at a time. The operator explicitly starts the camera
     // again for the next person; there is no automatic repeat on QR frames.
     setScanning(false);setWorking(false);scanLock.current=false;
   }
 }
 useEffect(()=>{if(!scanning)return;let cancelled=false;let client:{stop:()=>Promise<unknown>;clear:()=>void}|null=null;
 (async()=>{try{const m=await import("html5-qrcode");if(cancelled)return;const qr=new m.Html5Qrcode("imdx-qr-reader",{verbose:false});client=qr;clientRef.current=qr;await qr.start({facingMode:"environment"},{fps:10,qrbox:{width:225,height:225}},(text:string)=>{void check(text)},()=>{})}catch(e){if(!cancelled){setErrorTitle("Camera unavailable");setError("Check HTTPS and camera permission, or enter the pass code manually.");setScanning(false)}}})();
 return()=>{cancelled=true;if(client){void client.stop().catch(()=>{}).finally(()=>client?.clear())}clientRef.current=null}},[scanning,gate,zone]);
 return <main className="portal-shell"><nav className="portal-top"><a className="brandmark brandmark-image" href="/"><img src="/assets/imd-logo-orange.webp" alt="IMDX Indonesia Mining and Downstream Industries Exhibition 2027"/></a><span>PROTECTED CMS / ON-SITE ADMISSION</span><a href="/admin">Back to CMS</a></nav>
 <header><p className="eyebrow">GATE CONTROL / ACCESS VALIDATION</p><h1>Scan the <em>event pass.</em></h1><p>Each QR is verified server-side against person, entitlement, gate, zone and admission history. This page is accessed only by authenticated staff.</p></header>
 <section className="cms-scanner-section"><div className="form-grid"><label>Assigned admission gate<input required value={gate} onChange={e=>setGate(e.target.value)} placeholder="Enter approved gate name"/></label><label>Access zone<select required value={zone} onChange={e=>setZone(e.target.value)}><option value="">Choose an access zone</option><option value="EXPO_ENTRY">Exhibition entry</option><option value="CONFERENCE">Conference zone</option></select></label></div><p className="micro">Online validation required. Gate assignments and re-entry policy must be approved in the CMS before live admission.</p>
 <button disabled={!gate.trim()||!zone||working} onClick={()=>{setResult(null);setError("");setScanning(v=>!v)}} type="button">{scanning?"Stop camera":"Start camera scanner"}</button><div id="imdx-qr-reader" className="scanner-viewport" style={{display:scanning?"block":"none",marginTop:15}}/>
 <form onSubmit={e=>{e.preventDefault();void check(value)}}><label>Manual pass code fallback<input value={value} onChange={e=>setValue(e.target.value)} required minLength={20} placeholder="Opaque pass token"/></label><button disabled={working||!gate.trim()||!zone}>Validate with server</button></form>
 {result&&<div className="cms-scan-result" data-decision={result.result==="VALID_ACCEPTED"?"accepted":["ALREADY_CHECKED_IN","WRONG_ZONE","NOT_YET_VALID"].includes(result.result)?"warning":"denied"} role="status">
 <span aria-hidden="true" className="cms-scan-result-symbol">{result.result==="VALID_ACCEPTED"?"✓":result.result==="ALREADY_CHECKED_IN"?"!":"×"}</span>
 <strong>{result.result==="VALID_ACCEPTED"?"ACCEPTED":result.result==="ALREADY_CHECKED_IN"?"ALREADY CHECKED IN":result.result.replaceAll("_"," ")}</strong>
 <p>{result.message}</p>
 {result.result==="VALID_ACCEPTED"&&result.person&&<p>{result.person.name} · {result.person.access}</p>}
 </div>}
 {error&&<div className="cms-scan-offline" role="alert"><strong>{errorTitle}</strong><p>{error}</p><button type="button" className="ghost" onClick={()=>setError("")}>Retry</button></div>}<p className="micro">Duplicate scans are not counted twice. An offline or unverified result never grants admission.</p></section></main>}
