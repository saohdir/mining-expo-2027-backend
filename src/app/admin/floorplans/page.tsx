"use client";
import {useConfirm} from "../components/Confirm";
import {useCallback,useEffect,useRef,useState} from "react";
import {useCmsSession} from "../components/CmsShell";
import {CategoryManager,CsvAndAlign,PatternDefs,RemapReport,StatsPanel,type Category} from "./EditorPanels";
import {LiveFloor} from "./LiveFloor";
type Unit={id?:string;code:string;category:string;categoryId?:string|null;hall?:string|null;zone?:string|null;x:number;y:number;w:number;h:number;areaSqm:number;status?:string;lengthM?:number|null;widthM?:number|null;dimensionLabel?:string|null;rotation?:number;internalNotes?:string|null;placed?:boolean};
type Plan={id:string;title:string;versionNo:number;rowVersion:number;status:string;active?:boolean;replacesId?:string|null;canvasWidth:number;canvasHeight:number;backgroundUrl?:string|null;backgroundAlt?:string|null;backgroundRights?:string|null;units:Unit[]};
type PublishCheck={replaces?:{id:string;title:string;versionNo:number;status:string}|null;canPublish:boolean;needsRemap?:boolean;openRequests:number;activeHolds:number;activeAssignments:number;rowVersion:number;hasUnits:boolean};
const api=async(path:string,method="GET",body?:unknown)=>{const r=await fetch(path,{method,cache:"no-store",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.message||(Array.isArray(data.issues)&&data.issues.length?data.issues.map((i:{field:string;message:string})=>i.field+": "+i.message).join("; "):r.status===401?"Your CMS session has expired. Sign in again.":r.status===403?"Your role cannot do this.":"Request failed ("+r.status+")."));return data};
export default function FloorplanEditor(){
 const {actor}=useCmsSession();
 const canEdit=actor?.role==="SUPER_ADMIN"||actor?.role==="OPERATIONS";
 const ask=useConfirm();
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
 // Live floors can be edited in place ("Edit booth layout"); drafts are always editable; archived versions are history.
 const [layoutMode,setLayoutMode]=useState(false);
 const editable=!!plan&&canEdit&&(plan.status==="DRAFT"||(plan.status==="PUBLISHED"&&layoutMode));
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
     setSelected(-1);setDraw(false);setHasUnsaved(false);setLayoutMode(false);
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
   if(!plan||!editable)return;
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
   if(!editable)return;
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
 const nudge=(dx:number,dy:number)=>{if(!plan||!editable||selected<0)return;edit(prev=>prev.map((u,i)=>i===selected?{...u,x:Math.max(0,Math.min(plan.canvasWidth-u.w,u.x+dx)),y:Math.max(0,Math.min(plan.canvasHeight-u.h,u.y+dy))}:u))};
 const placeUnit=(index:number)=>{if(!plan)return;const u=units[index];const free=(()=>{for(let yy=20;yy+u.h<=plan.canvasHeight;yy+=20)for(let xx=20;xx+u.w<=plan.canvasWidth;xx+=20)if(!units.some(o=>o.placed!==false&&xx<o.x+o.w&&xx+u.w>o.x&&yy<o.y+o.h&&yy+u.h>o.y))return {x:xx,y:yy};return {x:0,y:0}})();
   edit(prev=>prev.map((v,i)=>i===index?{...v,placed:true,...free}:v));setSelected(index)};
 /** Checks every booth before saving and says exactly what to fix (the server applies the same rules). */
 const unitProblems=(list:Unit[])=>{if(!plan)return [] as {i:number;text:string}[];const out:{i:number;text:string}[]=[];const seen=new Map<string,number>();
  list.forEach((u,i)=>{const c=(u.code||"").trim(),name="Booth "+(c||"#"+(i+1));const num=(v:unknown)=>typeof v==="number"&&Number.isFinite(v);
   if(!/^[A-Za-z0-9_-]{1,25}$/.test(c))out.push({i,text:name+": booth code may only use letters, numbers, - and _ (no spaces or dots, max 25)"});
   const k=c.toUpperCase();if(c&&seen.has(k))out.push({i,text:name+": code is used twice"});else seen.set(k,i);
   if(!(u.category||"").trim())out.push({i,text:name+": choose a category"});
   if(!num(u.w)||u.w<=0||!num(u.h)||u.h<=0)out.push({i,text:name+": width and height on the plan must be greater than 0"});
   if(!num(u.x)||!num(u.y))out.push({i,text:name+": position (x, y) is empty"});
   if(!(num(u.areaSqm)&&u.areaSqm>0)&&!(u.lengthM&&u.widthM))out.push({i,text:name+": enter the area (m²) or length × width"});
   if(u.placed!==false&&num(u.x)&&num(u.w)&&num(u.y)&&num(u.h)&&(u.x+u.w>plan.canvasWidth+0.5||u.y+u.h>plan.canvasHeight+0.5))out.push({i,text:name+": outside the floor area ("+plan.canvasWidth+" × "+plan.canvasHeight+") — move it inside or make it smaller"})});
  return out};
 const save=async()=>{if(!plan)return;
  const clean=units.map(u=>({...u,code:(u.code||"").trim(),x:Math.max(0,Number(u.x)||0),y:Math.max(0,Number(u.y)||0)}));
  const bad=unitProblems(clean);
  if(bad.length){setSelected(bad[0].i);throw new Error("Cannot save yet — fix these booths: "+bad.slice(0,5).map(b=>b.text).join("; ")+(bad.length>5?"; and "+(bad.length-5)+" more":"")+".")}
  try{const r=await api("/api/admin/floorplans/"+plan.id+"/units","PUT",{rowVersion:plan.rowVersion,units:clean.map(u=>({code:u.code,category:u.category,categoryId:u.categoryId||null,hall:u.hall??null,zone:u.zone??null,x:u.x,y:u.y,w:u.w,h:u.h,areaSqm:u.areaSqm,lengthM:u.lengthM??null,widthM:u.widthM??null,dimensionLabel:u.dimensionLabel??null,rotation:u.rotation||0,internalNotes:u.internalNotes??null,placed:u.placed!==false}))});setWarnings(r.warnings||[]);setConflict(false);await load(plan.id);setWarnings(r.warnings||[])}catch(e){if(e instanceof Error&&/changed/i.test(e.message))setConflict(true);throw e}};
 // FR-096 autosave (opt-in): saves every 30 s while there are unsaved edits and no conflict.
 useEffect(()=>{if(!autosave||!hasUnsaved||conflict||busy||!plan||!editable)return;const t=setTimeout(()=>void run(save),30000);return()=>clearTimeout(t)});
 const current=units[selected];
 // One-click publish: saves pending edits, shows what will happen, no other prerequisites.
 const publishNow=async()=>{if(!plan)return;
   const replaces=preflight?.replaces;const moves=(preflight?.openRequests||0)+(preflight?.activeHolds||0)+(preflight?.activeAssignments||0);
   const ok=await ask({title:`Publish “${plan.title}”?`,tone:replaces?"warning":"info",confirmLabel:"Yes, publish",
     changes:[replaces?`It replaces the live floor “${replaces.title}” (v${replaces.versionNo}); that version moves to Archived versions.`:"It goes live as an additional floor next to the other live floors.",
       ...(hasUnsaved?["Your unsaved booth changes are saved first."]:[]),`${units.filter(u=>u.placed!==false).length} booth(s) become visible to customers${units.some(u=>u.placed===false)?` (${units.filter(u=>u.placed===false).length} unplaced booth(s) stay hidden until placed)`:""}.`],
     impact:[...(replaces&&moves?[`${moves} booking record(s) on the old floor move to booths with the same code; booked booths missing in this draft are copied in.`]:[]),"Customers see the floor in the portal and on the website right away.","You can still edit booths on the live floor afterwards, or set it inactive."],
     reason:{min:0,label:"Note for the audit log (optional)",initial:"Published from the floorplan editor"}});
   if(!ok)return;
   await run(async()=>{if(hasUnsaved)await save();const fresh=await api("/api/admin/floorplans/"+plan.id);
     const r=await api("/api/admin/floorplans/"+plan.id+"/publish","POST",{rowVersion:fresh.plan.rowVersion,reason:ok.reason||undefined});
     await refresh();await load(plan.id);
     if(r.remap?.restoredUnits?.length)setTimeout(()=>setMessage("Published. Booked booths copied from the old floor: "+r.remap.restoredUnits.join(", ")+"."),0)})};
 const removePlan=async()=>{if(!plan)return;
   const st=plan.status,kindLabel=st==="DRAFT"?"draft":st==="ARCHIVED"?"version":"floor";
   const ok=await ask({title:`Delete the ${kindLabel} “${plan.title}” (v${plan.versionNo})?`,tone:"danger",confirmLabel:"Yes, delete",typed:"DELETE",
     changes:[st==="DRAFT"?"The draft and its booths are deleted.":st==="ARCHIVED"?"This old version and its booths are deleted.":"The inactive floor and its booths are deleted."],
     impact:[...(st==="PUBLISHED"?["If the floor still has booking history (requests, holds or assignments), it is moved to Archived versions instead, so invoices and quotations keep their booths."]:[]),
       "This cannot be undone."],reason:{min:0,label:"Reason (optional)"}});
   if(!ok)return;
   await run(async()=>{const r=await api("/api/admin/floorplans/"+plan.id,"DELETE",{reason:ok.reason});const list=await refresh();setPlan(null);setUnits([]);
     const next=list.find(p=>p.status==="PUBLISHED")||list.find(p=>p.status==="DRAFT")||list[0];if(next)await load(next.id);
     setTimeout(()=>setMessage(r.result==="archived"?`“${plan.title}” still has booking history (${r.requests} request(s), ${r.assignments} assignment(s), ${r.holds} hold(s)), so it was moved to Archived versions instead of being deleted.`:`“${plan.title}” was deleted.`),0)})};
 return <main className="portal-shell"><nav className="portal-top"><a className="brandmark brandmark-image" href="/"><img src="/assets/imd-logo-orange.webp" alt="IMDX Indonesia Mining and Downstream Industries Exhibition 2027"/></a><span>CMS / FLOORPLAN</span><a href="/admin">Back to CMS</a></nav>
 <header><p className="eyebrow">OPERATIONS</p><h1>Floorplan <em>management.</em></h1><p>Several floors can be live at once; customers see only the active ones. On a live floor you can see and enter who booked each booth and split a booth&apos;s area. Booths can be edited on a draft or directly on a live floor (Edit booth layout). Drafts publish in one click; drafts, inactive floors and old versions can be deleted.</p></header>
 {message&&<div className="notice" role="status">{message}</div>}
 <section><h2>Choose a floorplan version</h2>
 {!canEdit&&<p className="micro">Read-only access. Only Operations and Super Admin can create, edit, publish or delete floorplans.</p>}<div className="form-grid"><label>New draft title<input value={draftName} onChange={e=>setDraftName(e.target.value)} required/></label><label>What is it?<select value={kind} onChange={e=>setKind(e.target.value)}><option value="new">A new floor (shown next to the other live floors)</option>{plans.filter(p=>p.status==="PUBLISHED").map(p=><option key={p.id} value={p.id}>New version of “{p.title}” (replaces it when published)</option>)}</select></label>
 <button disabled={busy||!canEdit} onClick={()=>void run(async()=>{const d=await api("/api/admin/floorplans","POST",{title:draftName,canvasWidth:1200,canvasHeight:800,...(kind==="new"?{newFloor:true}:{replacesId:kind})});await refresh();await load(d.plan.id)})}>Create draft version</button></div>
 {([["PUBLISHED","Live floors"],["DRAFT","Drafts"],["ARCHIVED","Archived versions"]] as const).map(([st,heading])=>{const group=plans.filter(p=>p.status===st);if(!group.length)return null;return <div key={st} className="floor-group"><h3 className="micro">{heading}</h3><div className="tabline">{group.map(p=><button type="button" key={p.id} className={p.id===plan?.id?"chosen":""}
 disabled={loadingEditor||busy} onClick={async()=>{if(hasUnsaved&&!(await ask({title:"Discard unsaved booth layout changes?",tone:"warning",confirmLabel:"Yes, discard",changes:["Your unsaved changes to this draft are lost."]})))return;void load(p.id).catch(e=>setMessage(e instanceof Error?e.message:"Unable to open version."))}}>{p.title} · v{p.versionNo}{p.status==="PUBLISHED"?(p.active===false?" · Inactive":" · Active"):p.status==="DRAFT"?(p.replacesId?" · new version of v"+(plans.find(x=>x.id===p.replacesId)?.versionNo??"?"):" · new floor"):""}</button>)}</div></div>})}
 {loadingEditor&&<p role="status" className="micro">Loading floorplan editor…</p>}
 {!plans.length&&<p className="micro">No floorplan editions yet. Create a draft to open the editor.</p>}
 </section>
 {plan&&<section><h2>{plan.title} <span className="status">{plan.status==="PUBLISHED"?(plan.active===false?"LIVE · INACTIVE":"LIVE · ACTIVE"):plan.status}</span></h2>
 {canEdit&&<div className="floor-actions">
  {plan.status==="PUBLISHED"&&<div className="seg" role="group" aria-label="Live floor view"><button type="button" aria-pressed={!layoutMode} className={!layoutMode?"chosen":"ghost"} onClick={async()=>{if(layoutMode&&hasUnsaved&&!(await ask({title:"Leave the layout editor?",tone:"warning",confirmLabel:"Yes, discard changes",changes:["Booth layout changes that are not saved are lost."]})))return;if(layoutMode)await load(plan.id)}}>Bookings &amp; companies</button>
   <button type="button" aria-pressed={layoutMode} className={layoutMode?"chosen":"ghost"} onClick={()=>setLayoutMode(true)}>Edit booth layout</button></div>}
  <span style={{flex:1}}/>
  {(plan.status!=="PUBLISHED"||plan.active===false)?<button type="button" className="ghost cms-danger-outline" disabled={busy} onClick={()=>void removePlan()}>{plan.status==="DRAFT"?"Delete draft":plan.status==="ARCHIVED"?"Delete version":"Delete floor"}</button>
   :<span className="micro">To delete this floor, set it inactive first.</span>}
 </div>}
 {plan.status==="PUBLISHED"&&layoutMode&&<p className="notice" role="status">You are editing the live floor “{plan.title}”. Saved changes are visible to customers right away. Booked, reserved and quoted booths cannot be removed.</p>}
 {plan.status==="PUBLISHED"&&!layoutMode&&<LiveFloor plan={{...plan,units:units.filter(u=>u.placed!==false).map(u=>({id:u.id,code:u.code,x:u.x,y:u.y,w:u.w,h:u.h,rotation:u.rotation}))}} canEdit={canEdit} canBook={canBook} onChanged={m=>{void refresh().then(()=>load(plan.id)).then(()=>setMessage(m))}}/>}
 {hasUnsaved&&<p role="status" className="warning">Unsaved layout edits. Use Save units to persist your changes.</p>}
 <div className="floorplan-clone">
  <h3>Clone or restore this version as a new draft</h3>
  <p className="micro">Historical editions are never republished in place. Reserved or occupied units are copied as blocked; customer bookings and assignments stay on their original plan.</p>
  <div className="form-grid"><label>New draft title<input value={cloneTitle} required minLength={3} maxLength={160} onChange={e=>setCloneTitle(e.target.value)}/></label>
  <label>Reason for version change<input value={cloneReason} minLength={8} maxLength={500} onChange={e=>setCloneReason(e.target.value)}/></label>
  <label>The copy is<select value={cloneKind} onChange={e=>setCloneKind(e.target.value)}><option value="">{plan.status==="PUBLISHED"?"A new version of this floor":"Default (replaces the live floor)"}</option><option value="new">A new, additional floor</option>{plans.filter(p=>p.status==="PUBLISHED"&&p.id!==plan.id).map(p=><option key={p.id} value={p.id}>New version of “{p.title}”</option>)}</select></label></div>
  <button className="ghost" disabled={!canEdit||busy||cloneTitle.trim().length<3||cloneReason.trim().length<8} onClick={()=>void run(async()=>{const v=await api("/api/admin/floorplans/"+plan.id+"/clone","POST",{title:cloneTitle,reason:cloneReason,...(cloneKind==="new"?{newFloor:true}:cloneKind?{replacesId:cloneKind}:{})});await refresh();await load(v.plan.id)})}>Create restored draft from v{plan.versionNo} ↗</button>
 </div>
 {!(plan.status==="DRAFT"||(plan.status==="PUBLISHED"&&layoutMode))?(plan.status==="PUBLISHED"?null:<p className="warning">Archived versions are read-only. Clone one to make changes.</p>):<>
 {plan.status==="DRAFT"&&<p className="micro" role="status">{preflight?.replaces?<>Publishing replaces the live floor “{preflight.replaces.title}” (v{preflight.replaces.versionNo}).</>:<>Publishing adds this as a new floor next to the other live floors.</>}</p>}
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
 {plan.status==="DRAFT"&&<button className="cms-small" disabled={!canEdit||busy} onClick={()=>void publishNow()}>Publish floor</button>}</div>
 {conflict&&<p className="warning" role="alert">Another admin saved this draft. Your edits are still here. <button type="button" className="link" onClick={async()=>{if(await ask({title:"Load the latest version?",tone:"warning",confirmLabel:"Yes, load latest",changes:["Your local edits are discarded and replaced by the version another admin saved."]}))void load(plan.id)}}>Load latest version</button></p>}
 {warnings.length>0&&<p className="warning micro" role="status">Overlap warnings (saved, not blocking): {warnings.slice(0,10).join("; ")}</p>}
 {units.some(u=>u.placed===false)&&<div className="floorplan-panel" aria-label="Unplaced units"><strong>Unplaced tray</strong> <span className="micro">Imported units without a position. Place them before publishing.</span>
   <div className="cms-row-actions">{units.map((u,i)=>u.placed===false&&<button type="button" key={u.code} className="cms-small ghost" onClick={()=>placeUnit(i)}>Place {u.code} ({u.areaSqm} m²)</button>)}</div></div>}
 <CategoryManager categories={categories} canEdit={canEdit} onChanged={()=>void loadCategories()}/>
 {plan.status==="DRAFT"&&<CsvAndAlign planId={plan.id} rowVersion={plan.rowVersion} canEdit={canEdit&&!hasUnsaved} onChanged={m=>void load(plan.id).then(()=>setMessage(m))}/>}
 <StatsPanel planId={plan.id}/>
 {preflightError&&<p className="warning" role="alert">Publication check unavailable: {preflightError}. The draft editor remains usable, but publishing is disabled. Check that the required booth database migrations are applied.</p>}
 {plan.status==="DRAFT"&&<div className="floorplan-publish-review" role="status">
  <strong>{preflight?.replaces?`Publishing replaces “${preflight.replaces.title}”`:"Publishing adds a new live floor"}</strong>
  {preflight?.needsRemap&&<p className="micro">Bookings on the floor being replaced move automatically to booths with the same code: open requests {preflight.openRequests}, holds {preflight.activeHolds}, assignments {preflight.activeAssignments}. Booked booths that are missing in this draft are copied in.</p>}
  <RemapReport planId={plan.id} onReport={onReport}/>
 </div>}
 <label>Floorplan background image (approved JPG/PNG/WebP or sanitized SVG, 15 MB max; PDF must be converted)<input type="file" disabled={!canEdit||busy} accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e=>{const file=e.target.files?.[0];if(file)void run(async()=>{const fd=new FormData();fd.append("file",file);const upload=await fetch("/api/admin/floorplans/"+plan.id+"/upload",{method:"POST",body:fd});const obj=await upload.json();if(!upload.ok)throw Error(obj.message||"Upload failed");await api("/api/admin/floorplans/"+plan.id,"PATCH",{rowVersion:plan.rowVersion,backgroundUrl:obj.url});await load(plan.id)})}}/></label>
 {plan.backgroundUrl&&<div className="form-grid"><label>Background alt text<input value={bgMeta.alt} minLength={3} maxLength={200} onChange={e=>setBgMeta({...bgMeta,alt:e.target.value})}/></label>
 <label>Image rights status<select value={bgMeta.rights} onChange={e=>setBgMeta({...bgMeta,rights:e.target.value})}><option value="">Choose…</option><option value="OWNED">Owned</option><option value="LICENSED">Licensed</option><option value="ORGANIZER_PROVIDED">Organizer provided</option><option value="PENDING_APPROVAL">Pending approval</option></select></label>
 <button type="button" className="cms-small" disabled={!canEdit||busy||bgMeta.alt.trim().length<3||!bgMeta.rights||hasUnsaved} onClick={()=>void run(async()=>{await api("/api/admin/floorplans/"+plan.id,"PATCH",{rowVersion:plan.rowVersion,backgroundAlt:bgMeta.alt.trim(),backgroundRights:bgMeta.rights});await load(plan.id)})}>Save image details</button></div>}
 </>}
 {(plan.status!=="PUBLISHED"||layoutMode)&&<div className="cms-columns" style={{gridTemplateColumns:"minmax(0,2fr) minmax(220px,1fr)"}}>
 <div className="floorplan-frame"><p className="micro">{draw?"Drawing mode: click a blank area to place a booth.":"Select/move mode: click a booth, then drag or edit its dimensions. Use + Add booth unit as an alternative."}</p><svg ref={svg} viewBox={"0 0 "+plan.canvasWidth+" "+plan.canvasHeight} aria-label="Editable booth floorplan" onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();undo()}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="y"){e.preventDefault();redo()}}}><PatternDefs categories={categories}/>
 {plan.backgroundUrl&&<image href={plan.backgroundUrl} x="0" y="0" width={plan.canvasWidth} height={plan.canvasHeight} preserveAspectRatio="xMidYMid meet"/>}
 <rect x="0" y="0" width={plan.canvasWidth} height={plan.canvasHeight} fill={plan.backgroundUrl?"transparent":"#fff0e6"} onPointerDown={e=>{if(!draw||!editable)return;const v=pt(e);addUnit(v.x,v.y)}}/>
 {units.map((u,i)=>u.placed===false?null:<g key={u.id||i} role="button" tabIndex={0} aria-label={u.code+" booth, "+u.areaSqm+" m², "+(u.status||"AVAILABLE")+(i===selected?", selected":"")} onClick={()=>setSelected(i)}
 transform={u.rotation?`rotate(${u.rotation} ${u.x} ${u.y})${u.rotation===90?` translate(0 ${-u.h})`:u.rotation===180?` translate(${-u.w} ${-u.h})`:u.rotation===270?` translate(${-u.w} 0)`:""}`:undefined}
 onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelected(i)}const step=e.shiftKey?1:10;
   if(e.key==="ArrowLeft"){e.preventDefault();setSelected(i);nudge(-step,0)}if(e.key==="ArrowRight"){e.preventDefault();setSelected(i);nudge(step,0)}if(e.key==="ArrowUp"){e.preventDefault();setSelected(i);nudge(0,-step)}if(e.key==="ArrowDown"){e.preventDefault();setSelected(i);nudge(0,step)}
   if((e.key==="Delete"||e.key==="Backspace")&&u.status==="AVAILABLE"&&editable){e.preventDefault();edit(arr=>arr.filter((_,j)=>j!==i));setSelected(-1)}}}
 onPointerDown={e=>{if(!editable||draw)return;e.stopPropagation();const p=pt(e);setSelected(i);setPast(h=>[...h.slice(-49),units]);setFuture([]);setDrag({index:i,x:u.x,y:u.y,startX:p.x,startY:p.y});e.currentTarget.setPointerCapture(e.pointerId)}}
 onPointerMove={e=>{if(!drag||drag.index!==i)return;setHasUnsaved(true);const p=pt(e);setUnits(old=>old.map((v,j)=>j===i?{...v,x:Math.max(0,Math.min(plan.canvasWidth-v.w,snap(drag.x+p.x-drag.startX))),y:Math.max(0,Math.min(plan.canvasHeight-v.h,snap(drag.y+p.y-drag.startY)))}:v))}}
 onPointerUp={()=>setDrag(null)}>
 <rect x={u.x} y={u.y} width={u.w} height={u.h} rx="3" stroke="#fff" strokeWidth={3} fill={i===selected?"#ff5912":u.status==="OCCUPIED"||u.status==="BLOCKED"?"#999":u.categoryId&&categories.some(c=>c.id===u.categoryId)?"url(#cat-"+u.categoryId+")":"#67bbd6"} opacity=".91"/>
 <text x={u.x+5} y={u.y+17} fill="#35120a" fontSize={14} pointerEvents="none">{u.code}</text>
 {u.status&&u.status!=="AVAILABLE"&&<text x={u.x+5} y={u.y+33} fill="#35120a" fontSize={10} pointerEvents="none">{u.status}</text>}</g>)}
 {/* FR-093 resize handle for the selected, unrotated draft unit (numeric w/h remain available). */}
 {current&&current.placed!==false&&!current.rotation&&editable&&<rect data-testid="resize-handle" role="slider" aria-label={"Resize "+current.code+" (width "+current.w+", height "+current.h+")"} aria-valuenow={current.w} tabIndex={0}
   x={current.x+current.w-6} y={current.y+current.h-6} width={12} height={12} fill="#35120a" stroke="#fff" strokeWidth={2} style={{cursor:"nwse-resize"}}
   onKeyDown={e=>{const step=e.shiftKey?1:10;const dw=e.key==="ArrowRight"?step:e.key==="ArrowLeft"?-step:0,dh=e.key==="ArrowDown"?step:e.key==="ArrowUp"?-step:0;if(!dw&&!dh)return;e.preventDefault();
     edit(arr=>arr.map((v,j)=>j===selected?{...v,w:Math.max(10,Math.min(plan.canvasWidth-v.x,v.w+dw)),h:Math.max(10,Math.min(plan.canvasHeight-v.y,v.h+dh))}:v))}}
   onPointerDown={e=>{e.stopPropagation();const p=pt(e);setPast(h=>[...h.slice(-49),units]);setFuture([]);resizeRef.current={index:selected,w:current.w,h:current.h,startX:p.x,startY:p.y};e.currentTarget.setPointerCapture(e.pointerId)}}
   onPointerMove={e=>{const rz=resizeRef.current;if(!rz)return;setHasUnsaved(true);const p=pt(e);setUnits(old=>old.map((v,j)=>j===rz.index?{...v,w:Math.max(10,Math.min(plan.canvasWidth-v.x,snap(rz.w+p.x-rz.startX))),h:Math.max(10,Math.min(plan.canvasHeight-v.y,snap(rz.h+p.y-rz.startY)))}:v))}}
   onPointerUp={()=>{resizeRef.current=null}}/>}
 </svg></div>
 <aside>{current?<><h3>Selected unit properties</h3><label>category<select disabled={!editable} value={current.categoryId||""} onChange={e=>adjust("categoryId",e.target.value)}><option value="">{current.category} (uncategorised)</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 {(["code","hall","zone","lengthM","widthM","areaSqm","dimensionLabel","x","y","w","h","internalNotes"] as (keyof Unit)[]).map(k=><label key={k}>{k==="lengthM"?"length (m)":k==="widthM"?"width (m)":k==="areaSqm"?"area m² (auto from length × width, editable)":k==="internalNotes"?"internal notes (never public)":k}<input disabled={!editable} type={["x","y","w","h","areaSqm","lengthM","widthM"].includes(k)?"number":"text"} step={["areaSqm","lengthM","widthM"].includes(k)?"0.1":"1"} value={String(current[k]??"")} onChange={e=>adjust(k,e.target.value)}/></label>)}
 <p className="micro">Rotation: {current.rotation||0}° · Use arrow keys to move (Shift = 1 px), Delete to remove an available unit.</p>{plan.status==="DRAFT"&&current.status==="BLOCKED"&&current.id&&<div className="floorplan-unblock">
 <p className="micro">Copied unavailable unit. Operations must approve any release and publication will remain blocked while historic bookings are unresolved.</p>
 <label>Reason for releasing blocked unit<input value={unblockReason} minLength={8} maxLength={500} onChange={e=>setUnblockReason(e.target.value)}/></label>
 <button type="button" disabled={!canEdit||busy||unblockReason.trim().length<8} onClick={()=>void run(async()=>{await api("/api/admin/floorplans/"+plan.id+"/units/"+current.id+"/unblock","POST",{rowVersion:plan.rowVersion,reason:unblockReason.trim()});setUnblockReason("");await load(plan.id)})}>Approve unit release</button>
 </div>}
 <button className="ghost" disabled={!editable||current.status!=="AVAILABLE"}
 onClick={()=>{edit(u=>u.filter((_,i)=>i!==selected));setSelected(-1)}}>Delete available unit</button></>:<p className="micro">Use Add mode to draw rectangles, then edit dimensions and area. Move existing rectangles by dragging; changes persist only after Save.</p>}</aside>
 </div>}</section>}</main>;
}
