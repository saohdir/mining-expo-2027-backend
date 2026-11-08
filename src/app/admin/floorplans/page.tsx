"use client";
import {useEffect,useRef,useState} from "react";
type Unit={id?:string;code:string;category:string;hall?:string|null;zone?:string|null;x:number;y:number;w:number;h:number;areaSqm:number;status?:string};
type Plan={id:string;title:string;versionNo:number;rowVersion:number;status:string;canvasWidth:number;canvasHeight:number;backgroundUrl?:string|null;units:Unit[]};
const api=async(path:string,method="GET",body?:unknown)=>{const r=await fetch(path,{method,cache:"no-store",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.message||"Request failed");return data};
export default function FloorplanEditor(){
 const [plans,setPlans]=useState<Plan[]>([]),[plan,setPlan]=useState<Plan|null>(null),[units,setUnits]=useState<Unit[]>([]),[selected,setSelected]=useState(-1),[draftName,setDraftName]=useState("IMDX Hall 2027"),[draw,setDraw]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [drag,setDrag]=useState<{index:number,x:number,y:number,startX:number,startY:number}|null>(null);
 const svg=useRef<SVGSVGElement>(null);
 const refresh=async()=>{const data=await api("/api/admin/floorplans");setPlans(data.plans||[])};
 const load=async(id:string)=>{const data=await api("/api/admin/floorplans/"+id);setPlan(data.plan);setUnits(data.plan.units.map((x:Unit)=>({...x,areaSqm:Number(x.areaSqm)})));setSelected(-1)};
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
 {plan.status!=="DRAFT"?<p className="warning">Published maps are locked. Create a new draft version for structural changes.</p>:<>
 <div className="cms-row-actions"><button className="cms-small" type="button" onClick={()=>setDraw(v=>!v)}>{draw?"Select / move mode":"Add booth rectangles"}</button>
 <button className="cms-small" disabled={busy||units.length===0} onClick={()=>void run(async()=>{await api("/api/admin/floorplans/"+plan.id+"/units","PUT",{rowVersion:plan.rowVersion,units:units.map(({id,status,...u})=>u)});await load(plan.id)})}>Save units</button>
 <button className="cms-small" disabled={busy} onClick={()=>void run(async()=>{await api("/api/admin/floorplans/"+plan.id+"/publish","POST");await refresh();await load(plan.id)})}>Publish map</button></div>
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
 <aside>{current?<><h3>Selected unit properties</h3>{(["code","category","hall","zone","x","y","w","h","areaSqm"] as (keyof Unit)[]).map(k=><label key={k}>{k}<input disabled={plan.status!=="DRAFT"} type={["x","y","w","h","areaSqm"].includes(k)?"number":"text"} step={k==="areaSqm"?"0.1":"1"} value={String(current[k]??"")} onChange={e=>adjust(k,e.target.value)}/></label>)}<button className="ghost" disabled={plan.status!=="DRAFT"||current.status==="OCCUPIED"} onClick={()=>{setUnits(u=>u.filter((_,i)=>i!==selected));setSelected(-1)}}>Delete unit</button></>:<p className="micro">Use Add mode to draw rectangles, then edit dimensions and area. Move existing rectangles by dragging; changes persist only after Save.</p>}</aside>
 </div></section>}</main>;
}
