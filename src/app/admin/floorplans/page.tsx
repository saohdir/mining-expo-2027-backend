"use client";
import {useEffect,useRef,useState} from "react";
import {useCmsSession} from "../components/CmsShell";
type Unit={id?:string;code:string;category:string;hall?:string|null;zone?:string|null;x:number;y:number;w:number;h:number;areaSqm:number;status?:string};
type Plan={id:string;title:string;versionNo:number;rowVersion:number;status:string;canvasWidth:number;canvasHeight:number;backgroundUrl?:string|null;units:Unit[]};
type PublishCheck={canPublish:boolean;openRequests:number;activeHolds:number;activeAssignments:number;rowVersion:number;hasUnits:boolean};
const api=async(path:string,method="GET",body?:unknown)=>{const r=await fetch(path,{method,cache:"no-store",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.message||"Request failed");return data};
export default function FloorplanEditor(){
 const {actor}=useCmsSession();
 const canEdit=actor?.role==="SUPER_ADMIN"||actor?.role==="OPERATIONS";
 const [plans,setPlans]=useState<Plan[]>([]),[plan,setPlan]=useState<Plan|null>(null),[units,setUnits]=useState<Unit[]>([]),[selected,setSelected]=useState(-1),[draftName,setDraftName]=useState("IMDX Hall 2027"),[draw,setDraw]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [drag,setDrag]=useState<{index:number,x:number,y:number,startX:number,startY:number}|null>(null);
 const [cloneTitle,setCloneTitle]=useState("IMDX restored layout"),[cloneReason,setCloneReason]=useState("");
 const [publishReason,setPublishReason]=useState(""),[publishApproved,setPublishApproved]=useState(false),[preflight,setPreflight]=useState<PublishCheck|null>(null);
 const [unblockReason,setUnblockReason]=useState("");
 const [preflightError,setPreflightError]=useState("");
 const [loadingEditor,setLoadingEditor]=useState(false);
 const [hasUnsaved,setHasUnsaved]=useState(false);
 const svg=useRef<SVGSVGElement>(null);
 const refresh=async()=>{const data=await api("/api/admin/floorplans");setPlans(data.plans||[]);return (data.plans||[]) as Plan[]};
 const load=async(id:string)=>{
   setLoadingEditor(true);setMessage("");setPreflightError("");setPreflight(null);
   try {
     // Editing the draft MUST NOT depend on publication or newer hold migrations.
     const data=await api("/api/admin/floorplans/"+id);
     setPlan(data.plan);setPublishReason("");setPublishApproved(false);
     setUnits(data.plan.units.map((x:Unit)=>({...x,areaSqm:Number(x.areaSqm)})));
     setSelected(-1);setDraw(false);setHasUnsaved(false);
     try{
       const preview=await api("/api/admin/floorplans/"+id+"/publish");
       setPreflight(preview);
     }catch(error){
       setPreflightError(error instanceof Error?error.message:"Publication preflight unavailable.");
       // Fail closed only for publication; canvas drawing and saving still work.
     }
   }finally{setLoadingEditor(false)}
 };
 useEffect(()=>{
   if(!actor)return;
   void (async()=>{
     try{
       const list=await refresh();
       const target=list.find(p=>p.status==="DRAFT")||list[0];
       if(target)await load(target.id);
     }catch(e){setMessage(e instanceof Error?e.message:"Unable to open floorplan.")}
   })();
 // The editor opens the latest draft when a staff session first becomes available.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[actor?.id]);
 const run=async(f:()=>Promise<void>)=>{setBusy(true);setMessage("");try{await f();setMessage("Saved successfully.")}catch(e){setMessage(e instanceof Error?e.message:"Error")}finally{setBusy(false)}};
 const pt=(e:{clientX:number;clientY:number})=>{
   const el=svg.current;
   if(!el)return {x:0,y:0};
   const point=el.createSVGPoint();point.x=e.clientX;point.y=e.clientY;
   const m=el.getScreenCTM();
   return m?point.matrixTransform(m.inverse()):{x:0,y:0};
 };
 const snap=(n:number)=>Math.round(n/10)*10;
 const addUnit=(x?:number,y?:number)=>{
   if(!plan||plan.status!=="DRAFT"||!canEdit)return;
   const codes=new Set(units.map(u=>u.code.toUpperCase()));
   let index=1;
   while(codes.has("B"+String(index).padStart(3,"0")))index++;
   const w=80,h=60;
   const unit:Unit={
     code:"B"+String(index).padStart(3,"0"),category:"Standard",
     x:Math.max(0,Math.min(plan.canvasWidth-w,snap(x??plan.canvasWidth/2-w/2))),
     y:Math.max(0,Math.min(plan.canvasHeight-h,snap(y??plan.canvasHeight/2-h/2))),
     w,h,areaSqm:18,status:"AVAILABLE"
   };
   setSelected(units.length);setUnits(prev=>[...prev,unit]);
   setHasUnsaved(true);
 };
 const adjust=(field:keyof Unit,v:string)=>{
   if(!canEdit||plan?.status!=="DRAFT")return;
   setHasUnsaved(true);
   setUnits(arr=>arr.map((unit,i)=>i===selected?{...unit,[field]:["x","y","w","h","areaSqm"].includes(field)?Number(v):v}:unit));
 };
 const current=units[selected];
 return <main className="portal-shell"><nav className="portal-top"><a className="brandmark brandmark-image" href="/"><img src="/assets/imd-logo-orange.webp" alt="IMDX Indonesia Mining and Downstream Industries Exhibition 2027"/></a><span>CMS / FLOORPLAN</span><a href="/admin">Back to CMS</a></nav>
 <header><p className="eyebrow">OPERATIONS</p><h1>Floorplan <em>management.</em></h1><p>Edit available booths in draft versions. Published maps are customer-facing read-only; requests never automatically hold a booth.</p></header>
 {message&&<div className="notice" role="status">{message}</div>}
 <section><h2>Choose a floorplan version</h2>
 {!canEdit&&<p className="micro">Read-only access. Only Operations and Super Admin can create or edit floorplan drafts.</p>}<div className="form-grid"><label>New draft title<input value={draftName} onChange={e=>setDraftName(e.target.value)} required/></label><button disabled={busy||!canEdit} onClick={()=>void run(async()=>{const d=await api("/api/admin/floorplans","POST",{title:draftName,canvasWidth:1200,canvasHeight:800,eventCode:"IMDX-2027"});await refresh();await load(d.plan.id)})}>Create draft version</button></div>
 <div className="tabline">{plans.map(p=><button type="button" key={p.id} className={p.id===plan?.id?"chosen":""}
 disabled={loadingEditor||busy} onClick={()=>{if(hasUnsaved&&!window.confirm("Discard unsaved booth layout changes?"))return;void load(p.id).catch(e=>setMessage(e instanceof Error?e.message:"Unable to open version."))}}>{p.title} · v{p.versionNo} · {p.status}</button>)}</div>
 {loadingEditor&&<p role="status" className="micro">Loading floorplan editor…</p>}
 {!plans.length&&<p className="micro">No floorplan editions yet. Create a draft to open the editor.</p>}
 </section>
 {plan&&<section><h2>{plan.title} <span className="status">{plan.status}</span></h2>
 {hasUnsaved&&<p role="status" className="warning">Unsaved layout edits. Use Save units to persist your changes.</p>}
 <div className="floorplan-clone">
  <h3>Clone or restore this version as a new draft</h3>
  <p className="micro">Historical editions are never republished in place. Reserved or occupied units are copied as blocked; customer bookings and assignments stay on their original plan.</p>
  <div className="form-grid"><label>New draft title<input value={cloneTitle} required minLength={3} maxLength={160} onChange={e=>setCloneTitle(e.target.value)}/></label>
  <label>Reason for version change<input value={cloneReason} minLength={8} maxLength={500} onChange={e=>setCloneReason(e.target.value)}/></label></div>
  <button className="ghost" disabled={!canEdit||busy||cloneTitle.trim().length<3||cloneReason.trim().length<8} onClick={()=>void run(async()=>{const v=await api("/api/admin/floorplans/"+plan.id+"/clone","POST",{title:cloneTitle,reason:cloneReason});await refresh();await load(v.plan.id)})}>Create restored draft from v{plan.versionNo} ↗</button>
 </div>
 {plan.status!=="DRAFT"?<p className="warning">Published and archived maps are immutable. Clone one to make changes. Publication requires a reconciliation preflight.</p>:<>
 <div className="cms-row-actions">
 <button type="button" className="cms-small" disabled={!canEdit||busy} onClick={()=>{addUnit();setDraw(false)}}>+ Add booth unit</button>
 <button className="cms-small" disabled={!canEdit||busy} type="button" aria-pressed={draw} onClick={()=>setDraw(v=>!v)}>{draw?"Select / move mode":"Draw booths on canvas"}</button>
 <button className="cms-small" disabled={!canEdit||busy||units.length===0||!hasUnsaved}
 onClick={()=>void run(async()=>{await api("/api/admin/floorplans/"+plan.id+"/units","PUT",
 {rowVersion:plan.rowVersion,units:units.map(({id,status,...u})=>u)});await load(plan.id)})}>
 Save {units.length} booth units</button>
 <button className="cms-small" disabled={!canEdit||busy||hasUnsaved||!preflight?.canPublish||publishReason.trim().length<8||!publishApproved} onClick={()=>void run(async()=>{await api("/api/admin/floorplans/"+plan.id+"/publish","POST",{rowVersion:plan.rowVersion,reason:publishReason.trim(),confirmReconciliation:true});await refresh();await load(plan.id)})}>Publish approved version</button></div>
 {preflightError&&<p className="warning" role="alert">Publication check unavailable: {preflightError}. The draft editor remains usable, but publishing is disabled. Check that the required booth database migrations are applied.</p>}
 <div className="floorplan-publish-review" role="status">
  <strong>Publication safety check: {preflight?.canPublish?"No unresolved booking conflicts":"Publication blocked until reconciled"}</strong>
  <p className="micro">Open requests: {preflight?.openRequests??"…"} · Active holds: {preflight?.activeHolds??"…"} · Active assignments: {preflight?.activeAssignments??"…"}</p>
  <p className="micro">A newer map cannot automatically remap paid bookings or active exhibitor commitments. Operations must resolve them using an approved procedure.</p>
  <label>Publish audit reason<textarea minLength={8} maxLength={500} value={publishReason} onChange={e=>setPublishReason(e.target.value)}/></label>
  <label className="consent"><input type="checkbox" checked={publishApproved} onChange={e=>setPublishApproved(e.target.checked)}/> I have reviewed the approved layout and confirm that no bookings require remapping.</label>
 </div>
 <label>Floorplan background image (approved JPG/PNG/WebP, 15 MB max)<input type="file" disabled={!canEdit||busy} accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void run(async()=>{const fd=new FormData();fd.append("file",file);const upload=await fetch("/api/admin/floorplans/"+plan.id+"/upload",{method:"POST",body:fd});const obj=await upload.json();if(!upload.ok)throw Error(obj.message||"Upload failed");await api("/api/admin/floorplans/"+plan.id,"PATCH",{rowVersion:plan.rowVersion,backgroundUrl:obj.url});await load(plan.id)})}}/></label>
 </>}
 <div className="cms-columns" style={{gridTemplateColumns:"minmax(0,2fr) minmax(220px,1fr)"}}>
 <div className="floorplan-frame"><p className="micro">{draw?"Drawing mode: click a blank area to place a booth.":"Select/move mode: click a booth, then drag or edit its dimensions. Use + Add booth unit as an alternative."}</p><svg ref={svg} viewBox={"0 0 "+plan.canvasWidth+" "+plan.canvasHeight} aria-label="Editable booth floorplan">
 {plan.backgroundUrl&&<image href={plan.backgroundUrl} x="0" y="0" width={plan.canvasWidth} height={plan.canvasHeight} preserveAspectRatio="xMidYMid meet"/>}
 <rect x="0" y="0" width={plan.canvasWidth} height={plan.canvasHeight} fill={plan.backgroundUrl?"transparent":"#fff0e6"} onPointerDown={e=>{if(!draw||plan.status!=="DRAFT"||!canEdit)return;const v=pt(e);addUnit(v.x,v.y)}}/>
 {units.map((u,i)=><g key={u.id||i} role="button" tabIndex={0} aria-label={u.code+" booth"} onClick={()=>setSelected(i)} onKeyDown={e=>{if(e.key==="Enter")setSelected(i)}}
 onPointerDown={e=>{if(plan.status!=="DRAFT"||!canEdit||draw)return;e.stopPropagation();const p=pt(e);setSelected(i);setDrag({index:i,x:u.x,y:u.y,startX:p.x,startY:p.y});e.currentTarget.setPointerCapture(e.pointerId)}}
 onPointerMove={e=>{if(!drag||drag.index!==i)return;setHasUnsaved(true);const p=pt(e);setUnits(old=>old.map((v,j)=>j===i?{...v,x:Math.max(0,Math.min(plan.canvasWidth-v.w,Math.round(drag.x+p.x-drag.startX))),y:Math.max(0,Math.min(plan.canvasHeight-v.h,Math.round(drag.y+p.y-drag.startY)))}:v))}}
 onPointerUp={()=>setDrag(null)}>
 <rect x={u.x} y={u.y} width={u.w} height={u.h} rx="3" stroke="#fff" strokeWidth={3} fill={i===selected?"#ff5912":u.status==="OCCUPIED"?"#999":"#67bbd6"} opacity=".91"/>
 <text x={u.x+5} y={u.y+17} fill="#35120a" fontSize={14} pointerEvents="none">{u.code}</text></g>)}</svg></div>
 <aside>{current?<><h3>Selected unit properties</h3>{(["code","category","hall","zone","x","y","w","h","areaSqm"] as (keyof Unit)[]).map(k=><label key={k}>{k}<input disabled={plan.status!=="DRAFT"||!canEdit} type={["x","y","w","h","areaSqm"].includes(k)?"number":"text"} step={k==="areaSqm"?"0.1":"1"} value={String(current[k]??"")} onChange={e=>adjust(k,e.target.value)}/></label>)}{plan.status==="DRAFT"&&current.status==="BLOCKED"&&current.id&&<div className="floorplan-unblock">
 <p className="micro">Copied unavailable unit. Operations must approve any release and publication will remain blocked while historic bookings are unresolved.</p>
 <label>Reason for releasing blocked unit<input value={unblockReason} minLength={8} maxLength={500} onChange={e=>setUnblockReason(e.target.value)}/></label>
 <button type="button" disabled={!canEdit||busy||unblockReason.trim().length<8} onClick={()=>void run(async()=>{await api("/api/admin/floorplans/"+plan.id+"/units/"+current.id+"/unblock","POST",{rowVersion:plan.rowVersion,reason:unblockReason.trim()});setUnblockReason("");await load(plan.id)})}>Approve unit release</button>
 </div>}
 <button className="ghost" disabled={!canEdit||plan.status!=="DRAFT"||current.status!=="AVAILABLE"}
 onClick={()=>{setUnits(u=>u.filter((_,i)=>i!==selected));setSelected(-1);setHasUnsaved(true)}}>Delete available unit</button></>:<p className="micro">Use Add mode to draw rectangles, then edit dimensions and area. Move existing rectangles by dragging; changes persist only after Save.</p>}</aside>
 </div></section>}</main>;
}
