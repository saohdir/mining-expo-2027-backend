"use client";
import {useEffect,useRef,useState} from "react";
type Unit={id?:string;code:string;category:string;hall?:string|null;zone?:string|null;x:number;y:number;w:number;h:number;areaSqm:number;status?:string};
type Plan={id:string;title:string;versionNo:number;rowVersion:number;status:string;canvasWidth:number;canvasHeight:number;backgroundUrl?:string|null;units:Unit[]};
type PublishCheck={canPublish:boolean;openRequests:number;activeHolds:number;activeAssignments:number;rowVersion:number;hasUnits:boolean};
const api=async(path:string,method="GET",body?:unknown)=>{const r=await fetch(path,{method,cache:"no-store",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.message||"Request failed");return data};
export default function FloorplanEditor(){
 const [plans,setPlans]=useState<Plan[]>([]),[plan,setPlan]=useState<Plan|null>(null),[units,setUnits]=useState<Unit[]>([]),[selected,setSelected]=useState(-1),[draftName,setDraftName]=useState("IMDX Hall 2027"),[draw,setDraw]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [drag,setDrag]=useState<{index:number,x:number,y:number,startX:number,startY:number}|null>(null);
 const [cloneTitle,setCloneTitle]=useState("IMDX restored layout"),[cloneReason,setCloneReason]=useState("");
 const [publishReason,setPublishReason]=useState(""),[publishApproved,setPublishApproved]=useState(false),[preflight,setPreflight]=useState<PublishCheck|null>(null);
 const [unblockReason,setUnblockReason]=useState("");
 const svg=useRef<SVGSVGElement>(null);
 const refresh=async()=>{const data=await api("/api/admin/floorplans");setPlans(data.plans||[])};
 const load=async(id:string)=>{const [data,preview]=await Promise.all([api("/api/admin/floorplans/"+id),api("/api/admin/floorplans/"+id+"/publish")]);setPlan(data.plan);setPreflight(preview);setPublishReason("");setPublishApproved(false);setUnits(data.plan.units.map((x:Unit)=>({...x,areaSqm:Number(x.areaSqm)})));setSelected(-1)};
 useEffect(()=>{void refresh().catch(e=>setMessage(e.message))},[]);
 const run=async(f:()=>Promise<void>)=>{setBusy(true);setMessage("");try{await f();setMessage("Saved successfully.")}catch(e){setMessage(e instanceof Error?e.message:"Error")}finally{setBusy(false)}};
 const pt=(e:{clientX:number;clientY:number})=>{const point=svg.current!.createSVGPoint();point.x=e.clientX;point.y=e.clientY;const m=svg.current!.getScreenCTM();return m?point.matrixTransform(m.inverse()):{x:0,y:0}};
 const adjust=(field:keyof Unit,v:string)=>setUnits(arr=>arr.map((unit,i)=>i===selected?{...unit,[field]:["x","y","w","h","areaSqm"].includes(field)?Number(v):v}:unit));
 const current=units[selected];
 return <main className="portal-shell"><nav className="portal-top"><a className="brandmark brandmark-image" href="/"><img src="/assets/imd-logo-orange.webp" alt="IMDX Indonesia Mining and Downstream Industries Exhibition 2027"/></a><span>CMS / FLOORPLAN</span><a href="/admin">Back to CMS</a></nav>
 <header><p className="eyebrow">OPERATIONS</p><h1>Floorplan <em>management.</em></h1><p>Edit available booths in draft versions. Published maps are customer-facing read-only; requests never automatically hold a booth.</p></header>
 {message&&<div className="notice" role="status">{message}</div>}
 <section><h2>Choose a floorplan version</h2><div className="form-grid"><label>New draft title<input value={draftName} onChange={e=>setDraftName(e.target.value)} required/></label><button disabled={busy} onClick={()=>void run(async()=>{const d=await api("/api/admin/floorplans","POST",{title:draftName,canvasWidth:1200,canvasHeight:800,eventCode:"IMDX-2027"});await refresh();await load(d.plan.id)})}>Create draft version</button></div>
 <div className="tabline">{plans.map(p=><button type="button" key={p.id} className={p.id===plan?.id?"chosen":""} onClick={()=>void load(p.id)}>{p.title} · v{p.versionNo} · {p.status}</button>)}</div></section>
 {plan&&<section><h2>{plan.title} <span className="status">{plan.status}</span></h2>
 <div className="floorplan-clone">
  <h3>Clone or restore this version as a new draft</h3>
  <p className="micro">Historical editions are never republished in place. Reserved or occupied units are copied as blocked; customer bookings and assignments stay on their original plan.</p>
  <div className="form-grid"><label>New draft title<input value={cloneTitle} required minLength={3} maxLength={160} onChange={e=>setCloneTitle(e.target.value)}/></label>
  <label>Reason for version change<input value={cloneReason} minLength={8} maxLength={500} onChange={e=>setCloneReason(e.target.value)}/></label></div>
  <button className="ghost" disabled={busy||cloneTitle.trim().length<3||cloneReason.trim().length<8} onClick={()=>void run(async()=>{const v=await api("/api/admin/floorplans/"+plan.id+"/clone","POST",{title:cloneTitle,reason:cloneReason});await refresh();await load(v.plan.id)})}>Create restored draft from v{plan.versionNo} ↗</button>
 </div>
 {plan.status!=="DRAFT"?<p className="warning">Published and archived maps are immutable. Clone one to make changes. Publication requires a reconciliation preflight.</p>:<>
 <div className="cms-row-actions"><button className="cms-small" type="button" onClick={()=>setDraw(v=>!v)}>{draw?"Select / move mode":"Add booth rectangles"}</button>
 <button className="cms-small" disabled={busy||units.length===0} onClick={()=>void run(async()=>{await api("/api/admin/floorplans/"+plan.id+"/units","PUT",{rowVersion:plan.rowVersion,units:units.map(({id,status,...u})=>u)});await load(plan.id)})}>Save units</button>
 <button className="cms-small" disabled={busy||!preflight?.canPublish||publishReason.trim().length<8||!publishApproved} onClick={()=>void run(async()=>{await api("/api/admin/floorplans/"+plan.id+"/publish","POST",{rowVersion:plan.rowVersion,reason:publishReason.trim(),confirmReconciliation:true});await refresh();await load(plan.id)})}>Publish approved version</button></div>
 <div className="floorplan-publish-review" role="status">
  <strong>Publication safety check: {preflight?.canPublish?"No unresolved booking conflicts":"Publication blocked until reconciled"}</strong>
  <p className="micro">Open requests: {preflight?.openRequests??"…"} · Active holds: {preflight?.activeHolds??"…"} · Active assignments: {preflight?.activeAssignments??"…"}</p>
  <p className="micro">A newer map cannot automatically remap paid bookings or active exhibitor commitments. Operations must resolve them using an approved procedure.</p>
  <label>Publish audit reason<textarea minLength={8} maxLength={500} value={publishReason} onChange={e=>setPublishReason(e.target.value)}/></label>
  <label className="consent"><input type="checkbox" checked={publishApproved} onChange={e=>setPublishApproved(e.target.checked)}/> I have reviewed the approved layout and confirm that no bookings require remapping.</label>
 </div>
 <label>Floorplan background image (approved JPG/PNG/WebP, 15 MB max)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void run(async()=>{const fd=new FormData();fd.append("file",file);const upload=await fetch("/api/admin/floorplans/"+plan.id+"/upload",{method:"POST",body:fd});const obj=await upload.json();if(!upload.ok)throw Error(obj.message||"Upload failed");await api("/api/admin/floorplans/"+plan.id,"PATCH",{rowVersion:plan.rowVersion,backgroundUrl:obj.url});await load(plan.id)})}}/></label>
 </>}
 <div className="cms-columns" style={{gridTemplateColumns:"minmax(0,2fr) minmax(220px,1fr)"}}>
 <div className="floorplan-frame"><svg ref={svg} viewBox={"0 0 "+plan.canvasWidth+" "+plan.canvasHeight} aria-label="Editable booth floorplan">
 {plan.backgroundUrl&&<image href={plan.backgroundUrl} x="0" y="0" width={plan.canvasWidth} height={plan.canvasHeight} preserveAspectRatio="xMidYMid meet"/>}
 <rect x="0" y="0" width={plan.canvasWidth} height={plan.canvasHeight} fill={plan.backgroundUrl?"transparent":"#fff0e6"} onPointerDown={e=>{if(!draw||plan.status!=="DRAFT")return;const v=pt(e);const i=units.length;setUnits(old=>[...old,{code:"B"+String(i+1).padStart(3,"0"),category:"Standard",x:Math.round(v.x),y:Math.round(v.y),w:80,h:60,areaSqm:18}]);setSelected(i)}}/>
 {units.map((u,i)=><g key={u.id||i} role="button" tabIndex={0} aria-label={u.code+" booth"} onClick={()=>setSelected(i)} onKeyDown={e=>{if(e.key==="Enter")setSelected(i)}}
 onPointerDown={e=>{if(plan.status!=="DRAFT"||draw)return;e.stopPropagation();const p=pt(e);setSelected(i);setDrag({index:i,x:u.x,y:u.y,startX:p.x,startY:p.y});e.currentTarget.setPointerCapture(e.pointerId)}}
 onPointerMove={e=>{if(!drag||drag.index!==i)return;const p=pt(e);setUnits(old=>old.map((v,j)=>j===i?{...v,x:Math.max(0,Math.min(plan.canvasWidth-v.w,Math.round(drag.x+p.x-drag.startX))),y:Math.max(0,Math.min(plan.canvasHeight-v.h,Math.round(drag.y+p.y-drag.startY)))}:v))}}
 onPointerUp={()=>setDrag(null)}>
 <rect x={u.x} y={u.y} width={u.w} height={u.h} rx="3" stroke="#fff" strokeWidth={3} fill={i===selected?"#ff5912":u.status==="OCCUPIED"?"#999":"#67bbd6"} opacity=".91"/>
 <text x={u.x+5} y={u.y+17} fill="#35120a" fontSize={14} pointerEvents="none">{u.code}</text></g>)}</svg></div>
 <aside>{current?<><h3>Selected unit properties</h3>{(["code","category","hall","zone","x","y","w","h","areaSqm"] as (keyof Unit)[]).map(k=><label key={k}>{k}<input disabled={plan.status!=="DRAFT"} type={["x","y","w","h","areaSqm"].includes(k)?"number":"text"} step={k==="areaSqm"?"0.1":"1"} value={String(current[k]??"")} onChange={e=>adjust(k,e.target.value)}/></label>)}{plan.status==="DRAFT"&&current.status==="BLOCKED"&&current.id&&<div className="floorplan-unblock">
 <p className="micro">Copied unavailable unit. Operations must approve any release and publication will remain blocked while historic bookings are unresolved.</p>
 <label>Reason for releasing blocked unit<input value={unblockReason} minLength={8} maxLength={500} onChange={e=>setUnblockReason(e.target.value)}/></label>
 <button type="button" disabled={busy||unblockReason.trim().length<8} onClick={()=>void run(async()=>{await api("/api/admin/floorplans/"+plan.id+"/units/"+current.id+"/unblock","POST",{rowVersion:plan.rowVersion,reason:unblockReason.trim()});setUnblockReason("");await load(plan.id)})}>Approve unit release</button>
 </div>}
 <button className="ghost" disabled={plan.status!=="DRAFT"||current.status!=="AVAILABLE"} onClick={()=>{setUnits(u=>u.filter((_,i)=>i!==selected));setSelected(-1)}}>Delete available unit</button></>:<p className="micro">Use Add mode to draw rectangles, then edit dimensions and area. Move existing rectangles by dragging; changes persist only after Save.</p>}</aside>
 </div></section>}</main>;
}
