"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useCmsSession} from "../components/CmsShell";
import {CategoryManager,CsvAndAlign,PatternDefs,RemapReport,StatsPanel,type Category} from "./EditorPanels";
import {LiveFloor} from "./LiveFloor";
type Unit={id?:string;code:string;category:string;categoryId?:string|null;hall?:string|null;zone?:string|null;x:number;y:number;w:number;h:number;areaSqm:number;status?:string;lengthM?:number|null;widthM?:number|null;dimensionLabel?:string|null;rotation?:number;internalNotes?:string|null;placed?:boolean};
type Plan={id:string;title:string;versionNo:number;rowVersion:number;status:string;active?:boolean;replacesId?:string|null;canvasWidth:number;canvasHeight:number;backgroundUrl?:string|null;backgroundAlt?:string|null;backgroundRights?:string|null;units:Unit[]};
type PublishCheck={replaces?:{id:string;title:string;versionNo:number;status:string}|null;canPublish:boolean;openRequests:number;activeHolds:number;activeAssignments:number;rowVersion:number;hasUnits:boolean};
const api=async(path:string,method="GET",body?:unknown)=>{const r=await fetch(path,{method,cache:"no-store",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.message||"Request failed");return data};
export default function FloorplanEditor(){
 const {actor}=useCmsSession();
 const canEdit=actor?.role==="SUPER_ADMIN"||actor?.role==="OPERATIONS";
 const canBook=canEdit||actor?.role==="SALES";
 const [kind,setKind]=useState("new"),[cloneKind,setCloneKind]=useState("");
 const [plans,setPlans]=useState<Plan[]>([]),[plan,setPlan]=useState<Plan|null>(null),[units,setUnits]=useState<Unit[]>([]),[selected,setSelected]=useState(-1),[draftName,setDraftName]=useState("IMDX Hall 2027"),[draw,setDraw]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [drag,setDrag]=useState<{index:number,x:number,y:number,startX:number,startY:number}|null>(null);
 const resizeRef=useRef<{index:number,w:number,h:number,startX:number,startY:number}|null>(null);
 const [cloneTitle,setCloneTitle]=useState("IMDX restored layout"),[cloneReason,setCloneReason]=useState("");
 const [publishReason,setPublishReason]=useState(""),[publishApproved,setPublishApproved]=useState(false),[preflight,setPreflight]=useState<PublishCheck|null>(null);
 const [unblockReason,setUnblockReason]=useState("");
 const [preflightError,setPreflightError]=useState("");
 const [loadingEditor,setLoadingEditor]=useState(false);
 const [hasUnsaved,setHasUnsaved]=useState(false);
 const svg=useRef<SVGSVGElement>(null);
 const [categories,setCategories]=useState<Category[]>([]),[past,setPast]=useState<Unit[][]>([]),[future,setFuture]=useState<Unit[][]>([]),[warnings,setWarnings]=useState<string[]>([]),[conflict,setConflict]=useState(false),[autosave,setAutosave]=useState(false),[gridSnap,setGridSnap]=useState(true);
 const [remap,setRemap]=useState<{hash:string;canApply:boolean;blocking:string[]}|null>(null),[remapApproved,setRemapApproved]=useState(false),[bgMeta,setBgMeta]=useState({alt:"",rights:""});
 const onReport=useCallback((r:{hash:string;canApply:boolean;blocking:string[]}|null)=>setRemap(r),[]);
 const loadCategories=async()=>{try{const d=await api("/api/admin/booth-categories");setCategories(d.categories)}catch{setCategories([])}};
 // Undoable edit: every geometry/property change goes through edit() (FR-093 undo/redo).
 const edit=(fn:(prev:Unit[])=>Unit[])=>{setUnits(prev=>{setPast(p=>[...p.slice(-49),prev]);setFuture([]);return fn(prev)});setHasUnsaved(true)};
 const undo=()=>{setPast(p=>{if(!p.length)return p;const last=p[p.length-1];setUnits(cur=>{setFuture(f=>[cur,...f]);return last});setHasUnsaved(true);return p.slice(0,-1)})};
 const redo=()=>{setFuture(f=>{if(!f.length)return f;const [next,...rest]=f;setUnits(cur=>{setPast(p=>[...p,cur]);return next});setHasUnsaved(true);return rest})};
 const refresh=async()=>{const data=await api("/api/admin/floorplans");setPlans(data.plans||[]);return (data.plans||[]) as Plan[]};
 const load=async(id:string)=>{
   setLoadingEditor(true);setMessage("");setPreflightError("");setPreflight(null);
   try {
     // Editing the draft MUST NOT depend on publication or newer hold migrations.
     const data=await api("/api/admin/floorplans/"+id);
     setPlan(data.plan);setPublishReason("");setPublishApproved(false);setRemapApproved(false);setConflict(false);setPast([]);setFuture([]);setWarnings([]);setBgMeta({alt:data.plan.backgroundAlt||"",rights:data.plan.backgroundRights||""});
     setUnits(data.plan.units.map((x:Unit)=>({...x,areaSqm:Number(x.areaSqm),lengthM:x.lengthM==null?null:Number(x.lengthM),widthM:x.widthM==null?null:Number(x.widthM)})));
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
       void loadCategories();
       const list=await refresh();
       const target=list.find(p=>p.status==="PUBLISHED")||list.find(p=>p.status==="DRAFT")||list[0];
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
 const snap=(n:number)=>gridSnap?Math.round(n/10)*10:Math.round(n);
 const addUnit=(x?:number,y?:number)=>{
   if(!plan||plan.status!=="DRAFT"||!canEdit)return;
   const codes=new Set(units.map(u=>u.code.toUpperCase()));
   let index=1;
   while(codes.has("B"+String(index).padStart(3,"0")))index++;
   const w=80,h=60;
   // Button-created units should not stack in the centre of the canvas.
   const candidates: {x:number;y:number}[]=[];
   for(let yy=20;yy+h<=plan.canvasHeight;yy+=80){
     for(let xx=20;xx+w<=plan.canvasWidth;xx+=100)candidates.push({x:xx,y:yy});
   }
   const free=candidates.find(candidate=>!units.some(u=>
     candidate.x<u.x+u.w && candidate.x+w>u.x &&
     candidate.y<u.y+u.h && candidate.y+h>u.y));
   const nextX=x===undefined?(free?.x??20):x;
   const nextY=y===undefined?(free?.y??20):y;
   const unit:Unit={
     code:"B"+String(index).padStart(3,"0"),category:"Standard",
     x:Math.max(0,Math.min(plan.canvasWidth-w,snap(nextX))),
     y:Math.max(0,Math.min(plan.canvasHeight-h,snap(nextY))),
     w,h,areaSqm:18,status:"AVAILABLE"
   };
   setSelected(units.length);edit(prev=>[...prev,unit]);
 };
 const adjust=(field:keyof Unit,v:string)=>{
   if(!canEdit||plan?.status!=="DRAFT")return;
   edit(arr=>arr.map((unit,i)=>{
     if(i!==selected)return unit;
     const numeric=["x","y","w","h","areaSqm","lengthM","widthM","rotation"].includes(field);
     const next={...unit,[field]:numeric?(v===""?null:Number(v)):v} as Unit;
     if((field==="lengthM"||field==="widthM")&&next.lengthM&&next.widthM){next.areaSqm=Math.round(next.lengthM*next.widthM*10)/10;next.dimensionLabel=next.lengthM+"×"+next.widthM}
     if(field==="categoryId"){const c=categories.find(c=>c.id===v);if(c)next.category=c.name}
     return next;
   }));
 };
 const duplicate=()=>{const u=units[selected];if(!u||!plan)return;const codes=new Set(units.map(x=>x.code.toUpperCase()));let n=2;while(codes.has((u.code+"-"+n).toUpperCase()))n++;
   edit(prev=>[...prev,{...u,id:undefined,status:"AVAILABLE",code:(u.code+"-"+n).slice(0,25),x:Math.min(plan.canvasWidth-u.w,u.x+20),y:Math.min(plan.canvasHeight-u.h,u.y+20)}]);setSelected(units.length)};
 const rotate=()=>edit(prev=>prev.map((u,i)=>i===selected?{...u,rotation:(((u.rotation||0)+90)%360)}:u));
 const nudge=(dx:number,dy:number)=>{if(!plan||plan.status!=="DRAFT"||!canEdit||selected<0)return;edit(prev=>prev.map((u,i)=>i===selected?{...u,x:Math.max(0,Math.min(plan.canvasWidth-u.w,u.x+dx)),y:Math.max(0,Math.min(plan.canvasHeight-u.h,u.y+dy))}:u))};
 const placeUnit=(index:number)=>{if(!plan)return;const u=units[index];const free=(()=>{for(let yy=20;yy+u.h<=plan.canvasHeight;yy+=20)for(let xx=20;xx+u.w<=plan.canvasWidth;xx+=20)if(!units.some(o=>o.placed!==false&&xx<o.x+o.w&&xx+u.w>o.x&&yy<o.y+o.h&&yy+u.h>o.y))return {x:xx,y:yy};return {x:0,y:0}})();
   edit(prev=>prev.map((v,i)=>i===index?{...v,placed:true,...free}:v));setSelected(index)};
 const save=async()=>{if(!plan)return;try{const r=await api("/api/admin/floorplans/"+plan.id+"/units","PUT",{rowVersion:plan.rowVersion,units:units.map(({id,status,...u})=>({...u,categoryId:u.categoryId||null,rotation:u.rotation||0,placed:u.placed!==false}))});setWarnings(r.warnings||[]);setConflict(false);await load(plan.id);setWarnings(r.warnings||[])}catch(e){if(e instanceof Error&&/changed/i.test(e.message))setConflict(true);throw e}};
 // FR-096 autosave (opt-in): saves every 30 s while there are unsaved edits and no conflict.
 useEffect(()=>{if(!autosave||!hasUnsaved||conflict||busy||!plan||plan.status!=="DRAFT")return;const t=setTimeout(()=>void run(save),30000);return()=>clearTimeout(t)});
 const current=units[selected];
 return <main className="portal-shell"><nav className="portal-top"><a className="brandmark brandmark-image" href="/"><img src="/assets/imd-logo-orange.webp" alt="IMDX Indonesia Mining and Downstream Industries Exhibition 2027"/></a><span>CMS / FLOORPLAN</span><a href="/admin">Back to CMS</a></nav>
 <header><p className="eyebrow">OPERATIONS</p><h1>Floorplan <em>management.</em></h1><p>Several floors can be live at once; customers see only the active ones. On a live floor you can see and enter who booked each booth and split a booth&apos;s area. Layout changes are made in a draft (new floor, or new version of a live floor).</p></header>
 {message&&<div className="notice" role="status">{message}</div>}
 <section><h2>Choose a floorplan version</h2>
 {!canEdit&&<p className="micro">Read-only access. Only Operations and Super Admin can create or edit floorplan drafts.</p>}<div className="form-grid"><label>New draft title<input value={draftName} onChange={e=>setDraftName(e.target.value)} required/></label><label>What is it?<select value={kind} onChange={e=>setKind(e.target.value)}><option value="new">A new floor (shown next to the other live floors)</option>{plans.filter(p=>p.status==="PUBLISHED").map(p=><option key={p.id} value={p.id}>New version of “{p.title}” (replaces it when published)</option>)}</select></label>
 <button disabled={busy||!canEdit} onClick={()=>void run(async()=>{const d=await api("/api/admin/floorplans","POST",{title:draftName,canvasWidth:1200,canvasHeight:800,...(kind==="new"?{newFloor:true}:{replacesId:kind})});await refresh();await load(d.plan.id)})}>Create draft version</button></div>
 {([["PUBLISHED","Live floors"],["DRAFT","Drafts"],["ARCHIVED","Archived versions"]] as const).map(([st,heading])=>{const group=plans.filter(p=>p.status===st);if(!group.length)return null;return <div key={st} className="floor-group"><h3 className="micro">{heading}</h3><div className="tabline">{group.map(p=><button type="button" key={p.id} className={p.id===plan?.id?"chosen":""}
 disabled={loadingEditor||busy} onClick={()=>{if(hasUnsaved&&!window.confirm("Discard unsaved booth layout changes?"))return;void load(p.id).catch(e=>setMessage(e instanceof Error?e.message:"Unable to open version."))}}>{p.title} · v{p.versionNo}{p.status==="PUBLISHED"?(p.active===false?" · Inactive":" · Active"):p.status==="DRAFT"?(p.replacesId?" · new version of v"+(plans.find(x=>x.id===p.replacesId)?.versionNo??"?"):" · new floor"):""}</button>)}</div></div>})}
 {loadingEditor&&<p role="status" className="micro">Loading floorplan editor…</p>}
 {!plans.length&&<p className="micro">No floorplan editions yet. Create a draft to open the editor.</p>}
 </section>
 {plan&&<section><h2>{plan.title} <span className="status">{plan.status==="PUBLISHED"?(plan.active===false?"LIVE · INACTIVE":"LIVE · ACTIVE"):plan.status}</span></h2>
 {plan.status==="PUBLISHED"&&<LiveFloor plan={{...plan,units:units.filter(u=>u.placed!==false).map(u=>({id:u.id,code:u.code,x:u.x,y:u.y,w:u.w,h:u.h,rotation:u.rotation}))}} canEdit={canEdit} canBook={canBook} onChanged={m=>{void refresh().then(()=>load(plan.id)).then(()=>setMessage(m))}}/>}
 {hasUnsaved&&<p role="status" className="warning">Unsaved layout edits. Use Save units to persist your changes.</p>}
 <div className="floorplan-clone">
  <h3>Clone or restore this version as a new draft</h3>
  <p className="micro">Historical editions are never republished in place. Reserved or occupied units are copied as blocked; customer bookings and assignments stay on their original plan.</p>
  <div className="form-grid"><label>New draft title<input value={cloneTitle} required minLength={3} maxLength={160} onChange={e=>setCloneTitle(e.target.value)}/></label>
  <label>Reason for version change<input value={cloneReason} minLength={8} maxLength={500} onChange={e=>setCloneReason(e.target.value)}/></label>
  <label>The copy is<select value={cloneKind} onChange={e=>setCloneKind(e.target.value)}><option value="">{plan.status==="PUBLISHED"?"A new version of this floor":"Default (replaces the live floor)"}</option><option value="new">A new, additional floor</option>{plans.filter(p=>p.status==="PUBLISHED"&&p.id!==plan.id).map(p=><option key={p.id} value={p.id}>New version of “{p.title}”</option>)}</select></label></div>
  <button className="ghost" disabled={!canEdit||busy||cloneTitle.trim().length<3||cloneReason.trim().length<8} onClick={()=>void run(async()=>{const v=await api("/api/admin/floorplans/"+plan.id+"/clone","POST",{title:cloneTitle,reason:cloneReason,...(cloneKind==="new"?{newFloor:true}:cloneKind?{replacesId:cloneKind}:{})});await refresh();await load(v.plan.id)})}>Create restored draft from v{plan.versionNo} ↗</button>
 </div>
 {plan.status!=="DRAFT"?(plan.status==="PUBLISHED"?null:<p className="warning">Archived versions are read-only. Clone one to make changes.</p>):<>
 <p className="micro" role="status">{preflight?.replaces?<>Publishing replaces the live floor “{preflight.replaces.title}” (v{preflight.replaces.versionNo}).</>:<>Publishing adds this as a new floor next to the other live floors.</>}</p>
 <div className="cms-row-actions">
 <button type="button" className="cms-small" disabled={!canEdit||busy} onClick={()=>{addUnit();setDraw(false)}}>+ Add booth unit</button>
 <button className="cms-small" disabled={!canEdit||busy} type="button" aria-pressed={draw} onClick={()=>setDraw(v=>!v)}>{draw?"Select / move mode":"Draw booths on canvas"}</button>
 <button className="cms-small" disabled={!canEdit||busy||!hasUnsaved}
 onClick={()=>void run(save)}>
 Save {units.length} booth units</button>
 <button type="button" className="cms-small ghost" disabled={!past.length} onClick={undo} title="Undo (Ctrl+Z)">Undo</button>
 <button type="button" className="cms-small ghost" disabled={!future.length} onClick={redo} title="Redo (Ctrl+Y)">Redo</button>
 <button type="button" className="cms-small ghost" disabled={!canEdit||selected<0} onClick={duplicate}>Duplicate</button>
 <button type="button" className="cms-small ghost" disabled={!canEdit||selected<0} onClick={rotate}>Rotate 90°</button>
 <label className="consent micro"><input type="checkbox" checked={gridSnap} onChange={e=>setGridSnap(e.target.checked)}/> Snap to 10 px grid</label>
 <label className="consent micro"><input type="checkbox" checked={autosave} onChange={e=>setAutosave(e.target.checked)}/> Autosave every 30 s</label>
 <button className="cms-small" disabled={!canEdit||busy||hasUnsaved||!preflight?.hasUnits||publishReason.trim().length<8||!publishApproved||(!preflight?.canPublish&&!(remapApproved&&remap?.canApply))} onClick={()=>void run(async()=>{await api("/api/admin/floorplans/"+plan.id+"/publish","POST",{rowVersion:plan.rowVersion,reason:publishReason.trim(),confirmReconciliation:true,...(!preflight?.canPublish?{approveRemap:true,remapHash:remap?.hash}:{})});await refresh();await load(plan.id)})}>Publish approved version</button></div>
 {conflict&&<p className="warning" role="alert">Another admin saved this draft. Your edits are still here. <button type="button" className="link" onClick={()=>{if(window.confirm("Discard your local edits and load the latest version?"))void load(plan.id)}}>Load latest version</button></p>}
 {warnings.length>0&&<p className="warning micro" role="status">Overlap warnings (saved, not blocking): {warnings.slice(0,10).join("; ")}</p>}
 {units.some(u=>u.placed===false)&&<div className="floorplan-panel" aria-label="Unplaced units"><strong>Unplaced tray</strong> <span className="micro">Imported units without a position. Place them before publishing.</span>
   <div className="cms-row-actions">{units.map((u,i)=>u.placed===false&&<button type="button" key={u.code} className="cms-small ghost" onClick={()=>placeUnit(i)}>Place {u.code} ({u.areaSqm} m²)</button>)}</div></div>}
 <CategoryManager categories={categories} canEdit={canEdit} onChanged={()=>void loadCategories()}/>
 <CsvAndAlign planId={plan.id} rowVersion={plan.rowVersion} canEdit={canEdit&&!hasUnsaved} onChanged={m=>void load(plan.id).then(()=>setMessage(m))}/>
 <StatsPanel planId={plan.id}/>
 {preflightError&&<p className="warning" role="alert">Publication check unavailable: {preflightError}. The draft editor remains usable, but publishing is disabled. Check that the required booth database migrations are applied.</p>}
 <div className="floorplan-publish-review" role="status">
  <strong>Publication safety check: {!preflight?.hasUnits?"Add and save at least one unit before publishing":preflight?.canPublish?"No unresolved booking conflicts":"Customer commitments exist — approved remap required"}</strong>
  <p className="micro">Open requests: {preflight?.openRequests??"…"} · Active holds: {preflight?.activeHolds??"…"} · Active assignments: {preflight?.activeAssignments??"…"}</p>
  <RemapReport planId={plan.id} onReport={onReport}/>
  {preflight&&!preflight.canPublish&&<label className="consent"><input type="checkbox" checked={remapApproved} disabled={!remap?.canApply} onChange={e=>setRemapApproved(e.target.checked)}/> I approve this remap: assignments, holds and accepted quotations move to units with the same code; old records are ended, not deleted.</label>}
  <label>Publish audit reason<textarea minLength={8} maxLength={500} value={publishReason} onChange={e=>setPublishReason(e.target.value)}/></label>
  <label className="consent"><input type="checkbox" checked={publishApproved} onChange={e=>setPublishApproved(e.target.checked)}/> I have reviewed the approved layout and the remap report above.</label>
 </div>
 <label>Floorplan background image (approved JPG/PNG/WebP or sanitized SVG, 15 MB max; PDF must be converted)<input type="file" disabled={!canEdit||busy} accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e=>{const file=e.target.files?.[0];if(file)void run(async()=>{const fd=new FormData();fd.append("file",file);const upload=await fetch("/api/admin/floorplans/"+plan.id+"/upload",{method:"POST",body:fd});const obj=await upload.json();if(!upload.ok)throw Error(obj.message||"Upload failed");await api("/api/admin/floorplans/"+plan.id,"PATCH",{rowVersion:plan.rowVersion,backgroundUrl:obj.url});await load(plan.id)})}}/></label>
 {plan.backgroundUrl&&<div className="form-grid"><label>Background alt text (required to publish)<input value={bgMeta.alt} minLength={3} maxLength={200} onChange={e=>setBgMeta({...bgMeta,alt:e.target.value})}/></label>
 <label>Image rights status<select value={bgMeta.rights} onChange={e=>setBgMeta({...bgMeta,rights:e.target.value})}><option value="">Choose…</option><option value="OWNED">Owned</option><option value="LICENSED">Licensed</option><option value="ORGANIZER_PROVIDED">Organizer provided</option><option value="PENDING_APPROVAL">Pending approval</option></select></label>
 <button type="button" className="cms-small" disabled={!canEdit||busy||bgMeta.alt.trim().length<3||!bgMeta.rights||hasUnsaved} onClick={()=>void run(async()=>{await api("/api/admin/floorplans/"+plan.id,"PATCH",{rowVersion:plan.rowVersion,backgroundAlt:bgMeta.alt.trim(),backgroundRights:bgMeta.rights});await load(plan.id)})}>Save image details</button></div>}
 </>}
 {plan.status!=="PUBLISHED"&&<div className="cms-columns" style={{gridTemplateColumns:"minmax(0,2fr) minmax(220px,1fr)"}}>
 <div className="floorplan-frame"><p className="micro">{draw?"Drawing mode: click a blank area to place a booth.":"Select/move mode: click a booth, then drag or edit its dimensions. Use + Add booth unit as an alternative."}</p><svg ref={svg} viewBox={"0 0 "+plan.canvasWidth+" "+plan.canvasHeight} aria-label="Editable booth floorplan" onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();undo()}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"){e.preventDefault();redo()}}}><PatternDefs categories={categories}/>
 {plan.backgroundUrl&&<image href={plan.backgroundUrl} x="0" y="0" width={plan.canvasWidth} height={plan.canvasHeight} preserveAspectRatio="xMidYMid meet"/>}
 <rect x="0" y="0" width={plan.canvasWidth} height={plan.canvasHeight} fill={plan.backgroundUrl?"transparent":"#fff0e6"} onPointerDown={e=>{if(!draw||plan.status!=="DRAFT"||!canEdit)return;const v=pt(e);addUnit(v.x,v.y)}}/>
 {units.map((u,i)=>u.placed===false?null:<g key={u.id||i} role="button" tabIndex={0} aria-label={u.code+" booth, "+u.areaSqm+" m², "+(u.status||"AVAILABLE")+(i===selected?", selected":"")} onClick={()=>setSelected(i)}
 transform={u.rotation?`rotate(${u.rotation} ${u.x} ${u.y})${u.rotation===90?` translate(0 ${-u.h})`:u.rotation===180?` translate(${-u.w} ${-u.h})`:u.rotation===270?` translate(${-u.w} 0)`:""}`:undefined}
 onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelected(i)}const step=e.shiftKey?1:10;
   if(e.key==="ArrowLeft"){e.preventDefault();setSelected(i);nudge(-step,0)}if(e.key==="ArrowRight"){e.preventDefault();setSelected(i);nudge(step,0)}if(e.key==="ArrowUp"){e.preventDefault();setSelected(i);nudge(0,-step)}if(e.key==="ArrowDown"){e.preventDefault();setSelected(i);nudge(0,step)}
   if((e.key==="Delete"||e.key==="Backspace")&&u.status==="AVAILABLE"&&canEdit&&plan.status==="DRAFT"){e.preventDefault();edit(arr=>arr.filter((_,j)=>j!==i));setSelected(-1)}}}
 onPointerDown={e=>{if(plan.status!=="DRAFT"||!canEdit||draw)return;e.stopPropagation();const p=pt(e);setSelected(i);setPast(h=>[...h.slice(-49),units]);setFuture([]);setDrag({index:i,x:u.x,y:u.y,startX:p.x,startY:p.y});e.currentTarget.setPointerCapture(e.pointerId)}}
 onPointerMove={e=>{if(!drag||drag.index!==i)return;setHasUnsaved(true);const p=pt(e);setUnits(old=>old.map((v,j)=>j===i?{...v,x:Math.max(0,Math.min(plan.canvasWidth-v.w,snap(drag.x+p.x-drag.startX))),y:Math.max(0,Math.min(plan.canvasHeight-v.h,snap(drag.y+p.y-drag.startY)))}:v))}}
 onPointerUp={()=>setDrag(null)}>
 <rect x={u.x} y={u.y} width={u.w} height={u.h} rx="3" stroke="#fff" strokeWidth={3} fill={i===selected?"#ff5912":u.status==="OCCUPIED"||u.status==="BLOCKED"?"#999":u.categoryId&&categories.some(c=>c.id===u.categoryId)?"url(#cat-"+u.categoryId+")":"#67bbd6"} opacity=".91"/>
 <text x={u.x+5} y={u.y+17} fill="#35120a" fontSize={14} pointerEvents="none">{u.code}</text>
 {u.status&&u.status!=="AVAILABLE"&&<text x={u.x+5} y={u.y+33} fill="#35120a" fontSize={10} pointerEvents="none">{u.status}</text>}</g>)}
 {/* FR-093 resize handle for the selected, unrotated draft unit (numeric w/h remain available). */}
 {current&&current.placed!==false&&!current.rotation&&plan.status==="DRAFT"&&canEdit&&<rect data-testid="resize-handle" role="slider" aria-label={"Resize "+current.code+" (width "+current.w+", height "+current.h+")"} aria-valuenow={current.w} tabIndex={0}
   x={current.x+current.w-6} y={current.y+current.h-6} width={12} height={12} fill="#35120a" stroke="#fff" strokeWidth={2} style={{cursor:"nwse-resize"}}
   onKeyDown={e=>{const step=e.shiftKey?1:10;const dw=e.key==="ArrowRight"?step:e.key==="ArrowLeft"?-step:0,dh=e.key==="ArrowDown"?step:e.key==="ArrowUp"?-step:0;if(!dw&&!dh)return;e.preventDefault();
     edit(arr=>arr.map((v,j)=>j===selected?{...v,w:Math.max(10,Math.min(plan.canvasWidth-v.x,v.w+dw)),h:Math.max(10,Math.min(plan.canvasHeight-v.y,v.h+dh))}:v))}}
   onPointerDown={e=>{e.stopPropagation();const p=pt(e);setPast(h=>[...h.slice(-49),units]);setFuture([]);resizeRef.current={index:selected,w:current.w,h:current.h,startX:p.x,startY:p.y};e.currentTarget.setPointerCapture(e.pointerId)}}
   onPointerMove={e=>{const rz=resizeRef.current;if(!rz)return;setHasUnsaved(true);const p=pt(e);setUnits(old=>old.map((v,j)=>j===rz.index?{...v,w:Math.max(10,Math.min(plan.canvasWidth-v.x,snap(rz.w+p.x-rz.startX))),h:Math.max(10,Math.min(plan.canvasHeight-v.y,snap(rz.h+p.y-rz.startY)))}:v))}}
   onPointerUp={()=>{resizeRef.current=null}}/>}
 </svg></div>
 <aside>{current?<><h3>Selected unit properties</h3><label>category<select disabled={plan.status!=="DRAFT"||!canEdit} value={current.categoryId||""} onChange={e=>adjust("categoryId",e.target.value)}><option value="">{current.category} (uncategorised)</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 {(["code","hall","zone","lengthM","widthM","areaSqm","dimensionLabel","x","y","w","h","internalNotes"] as (keyof Unit)[]).map(k=><label key={k}>{k==="lengthM"?"length (m)":k==="widthM"?"width (m)":k==="areaSqm"?"area m² (auto from length × width, editable)":k==="internalNotes"?"internal notes (never public)":k}<input disabled={plan.status!=="DRAFT"||!canEdit} type={["x","y","w","h","areaSqm","lengthM","widthM"].includes(k)?"number":"text"} step={["areaSqm","lengthM","widthM"].includes(k)?"0.1":"1"} value={String(current[k]??"")} onChange={e=>adjust(k,e.target.value)}/></label>)}
 <p className="micro">Rotation: {current.rotation||0}° · Use arrow keys to move (Shift = 1 px), Delete to remove an available unit.</p>{plan.status==="DRAFT"&&current.status==="BLOCKED"&&current.id&&<div className="floorplan-unblock">
 <p className="micro">Copied unavailable unit. Operations must approve any release and publication will remain blocked while historic bookings are unresolved.</p>
 <label>Reason for releasing blocked unit<input value={unblockReason} minLength={8} maxLength={500} onChange={e=>setUnblockReason(e.target.value)}/></label>
 <button type="button" disabled={!canEdit||busy||unblockReason.trim().length<8} onClick={()=>void run(async()=>{await api("/api/admin/floorplans/"+plan.id+"/units/"+current.id+"/unblock","POST",{rowVersion:plan.rowVersion,reason:unblockReason.trim()});setUnblockReason("");await load(plan.id)})}>Approve unit release</button>
 </div>}
 <button className="ghost" disabled={!canEdit||plan.status!=="DRAFT"||current.status!=="AVAILABLE"}
 onClick={()=>{edit(u=>u.filter((_,i)=>i!==selected));setSelected(-1)}}>Delete available unit</button></>:<p className="micro">Use Add mode to draw rectangles, then edit dimensions and area. Move existing rectangles by dragging; changes persist only after Save.</p>}</aside>
 </div>}</section>}</main>;
}
