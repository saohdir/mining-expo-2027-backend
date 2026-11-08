"use client";

import Link from "next/link";
import {usePathname, useRouter} from "next/navigation";
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode
} from "react";

export type CmsRole =
  "SUPER_ADMIN"|"SALES"|"FINANCE"|"OPERATIONS"|"CONTENT_EDITOR"|"CHECKIN_STAFF"|"VIEWER";
type Actor={id:string;email:string;role:CmsRole};
type Session={actor:Actor|null;loading:boolean;refresh:()=>Promise<void>;signOut:()=>Promise<void>};
const SessionContext=createContext<Session|null>(null);
export const useCmsSession=()=> {
  const value=useContext(SessionContext);
  if(!value)throw new Error("CmsSession is unavailable");
  return value;
};

export type IconName="overview"|"users"|"tickets"|"booths"|"request"|"invoice"|"payments"|
  "floorplan"|"box"|"scan"|"activity"|"chart"|"calendar"|"file"|"bell"|"shield"|
  "settings"|"menu"|"search"|"close"|"arrow"|"logout"|"clock"|"check";
export function CmsIcon({name,size=20}:{name:IconName;size?:number}){
  const geometry:Record<IconName,ReactNode>={
    overview:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    users:<><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/></>,
    tickets:<><path d="M4 5h16v4a3 3 0 0 0 0 6v4H4v-4a3 3 0 0 0 0-6V5zM13 5v14" strokeDasharray="3 3"/></>,
    booths:<><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M10 10v10M15 4v6"/></>,
    request:<><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
    invoice:<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6M9 16h4"/></>,
    payments:<><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h5"/></>,
    floorplan:<><path d="M4 3h16v18H4zM4 10h16M11 3v7M15 10v11M4 16h11"/></>,
    box:<><path d="m12 2 9 5-9 5-9-5 9-5zm-9 5v10l9 5 9-5V7M12 12v10"/></>,
    scan:<><path d="M8 3H4v5M16 3h4v5M20 16v5h-4M8 21H4v-5M3 12h18"/></>,
    activity:<><path d="M3 17h4l3-10 4 13 3-8 2 5h2"/></>,
    chart:<><path d="M3 3v18h18M7 17v-6M12 17V7M17 17V4"/></>,
    calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
    file:<><path d="M6 2h9l5 5v15H6zM15 2v6h5M9 12h8M9 16h8"/></>,
    bell:<><path d="M18 8a6 6 0 0 0-12 0c0 8-3 8-3 10h18c0-2-3-2-3-10M10 21h4"/></>,
    shield:<><path d="m12 2 9 4v6c0 5-4 8-9 10-5-2-9-5-9-10V6l9-4zM9 12l2 2 4-5"/></>,
    settings:<><circle cx="12" cy="12" r="3"/><path d="M10 2h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-3 1-2-4 2-2v-3L1 9l2-4 3 1 3-1z"/></>,
    menu:<path d="M4 6h16M4 12h16M4 18h16"/>,
    search:<><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></>,
    close:<path d="M5 5l14 14M19 5 5 19"/>,
    arrow:<path d="M5 12h14m-6-6 6 6-6 6"/>,
    logout:<><path d="M10 3H4v18h6M14 7l5 5-5 5M8 12h11"/></>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></>,
    check:<path d="m4 12 5 5L20 6"/>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{geometry[name]}</svg>;
}

type NavItem={label:string;href:string;icon:IconName;roles:CmsRole[]};
type Group={title:string;items:NavItem[]};
const ALL:CmsRole[]=["SUPER_ADMIN","SALES","FINANCE","OPERATIONS","CONTENT_EDITOR","CHECKIN_STAFF","VIEWER"];
const OPS:CmsRole[]=["SUPER_ADMIN","OPERATIONS"];
const SALES:CmsRole[]=["SUPER_ADMIN","SALES","OPERATIONS"];
const FIN:CmsRole[]=["SUPER_ADMIN","FINANCE","SALES"];
const navGroups:Group[]=[
  {title:"Main",items:[
    {label:"Overview",href:"/admin",icon:"overview",roles:ALL.filter(r=>r!=="CHECKIN_STAFF")},
    {label:"Customers & Registrations",href:"/admin/registrations",icon:"users",roles:["SUPER_ADMIN","SALES","FINANCE","OPERATIONS"]},
    {label:"Booth Requests",href:"/admin/booths",icon:"booths",roles:["SUPER_ADMIN","SALES","FINANCE","OPERATIONS"]}
  ]},
  {title:"Finance",items:[
    {label:"Payment Requests",href:"/admin/workspace?section=finance#cms-payment-requests",icon:"request",roles:FIN},
    {label:"Invoices",href:"/admin/workspace?section=finance#cms-invoices",icon:"invoice",roles:FIN},
    {label:"Payments & Reconciliation",href:"/admin/payments",icon:"payments",roles:["SUPER_ADMIN","FINANCE","SALES"]}
  ]},
  {title:"Operations",items:[
    {label:"Floorplans",href:"/admin/floorplans",icon:"floorplan",roles:["SUPER_ADMIN","OPERATIONS","SALES","FINANCE"]},
    {label:"Booth Units & Assignments",href:"/admin/booths",icon:"box",roles:OPS},
    {label:"Gate QR Scanner",href:"/admin/check-in",icon:"scan",roles:["SUPER_ADMIN","OPERATIONS","CHECKIN_STAFF"]},
    {label:"Check-ins",href:"/admin/reports",icon:"activity",roles:["SUPER_ADMIN","OPERATIONS","VIEWER"]}
  ]},
  {title:"Insights",items:[
    {label:"Reports & Exports",href:"/admin/reports",icon:"chart",roles:["SUPER_ADMIN","SALES","FINANCE","OPERATIONS","VIEWER"]}
  ]},
  {title:"Content",items:[
    {label:"Events & Programmes",href:"/admin/programmes",icon:"calendar",roles:["SUPER_ADMIN","SALES","OPERATIONS","CONTENT_EDITOR","FINANCE"]},
    {label:"Event Settings",href:"/admin/workspace?section=settings",icon:"settings",roles:["SUPER_ADMIN"]}
  ]},
  {title:"System",items:[
    {label:"Notifications",href:"/admin/notifications",icon:"bell",roles:ALL.filter(r=>r!=="CHECKIN_STAFF")},
    {label:"Audit Log",href:"/admin/audit",icon:"shield",roles:["SUPER_ADMIN"]}
  ]}
];
type Note={id:string;type:string;readAt:string|null;createdAt:string;recordId:string};
type Result={type:string;label:string;hint:string;href:string};
const labelize=(v:string)=>v.replace(/_/g," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

export default function CmsShell({children}:{children:ReactNode}){
  const pathname=usePathname();const router=useRouter();
  const [actor,setActor]=useState<Actor|null>(null);
  const [loading,setLoading]=useState(true);
  const [drawer,setDrawer]=useState(false);
  const [search,setSearch]=useState("");
  const [results,setResults]=useState<Result[]>([]);
  const [searching,setSearching]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const [notes,setNotes]=useState<Note[]>([]);
  const [noteOpen,setNoteOpen]=useState(false);
  const [sessionError,setSessionError]=useState("");
  const searchRef=useRef<HTMLDivElement>(null);

  const refresh=useCallback(async()=>{
    try{
      const res=await fetch("/api/admin/me",{cache:"no-store"});
      if(!res.ok){setActor(null);return}
      setActor(await res.json() as Actor);
    }catch{setActor(null)}finally{setLoading(false)}
  },[]);
  useEffect(()=>{void refresh();const handler=()=>void refresh();
    window.addEventListener("imdx:session-changed",handler);
    return()=>window.removeEventListener("imdx:session-changed",handler);
  },[refresh]);
  useEffect(()=>{setDrawer(false);setNoteOpen(false);setSearchOpen(false)},[pathname]);
  useEffect(()=>{if(actor?.role==="CHECKIN_STAFF"&&pathname==="/admin")router.replace("/admin/check-in")},[actor,pathname,router]);
  useEffect(()=>{if(!actor)return;
    let active=true;
    fetch("/api/admin/notifications",{cache:"no-store"}).then(r=>r.ok?r.json():{notifications:[]})
      .then(d=>{if(active)setNotes((d.notifications||[]).slice(0,6))}).catch(()=>{});
    return()=>{active=false};
  },[actor]);
  useEffect(()=>{
    if(!actor||search.trim().length<2){setResults([]);setSearching(false);return}
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      setSearching(true);
      try{const response=await fetch("/api/admin/search?q="+encodeURIComponent(search.trim()),{signal:controller.signal,cache:"no-store"});
        const data=response.ok?await response.json():{results:[]};
        if(!controller.signal.aborted)setResults(data.results||[]);
      }catch{if(!controller.signal.aborted)setResults([])}
      finally{if(!controller.signal.aborted)setSearching(false)}
    },250);
    return()=>{clearTimeout(timer);controller.abort()};
  },[actor,search]);
  const signOut=useCallback(async()=>{
    try{
      const response=await fetch("/api/admin/auth/logout",{method:"POST"});
      if(!response.ok)throw new Error("Unable to sign out.");
      setActor(null);setSessionError("");window.location.assign("/admin");
    }catch(e){setSessionError(e instanceof Error?e.message:"Unable to sign out")}
  },[]);
  const groups=useMemo(()=>navGroups.map(g=>({...g,items:g.items.filter(i=>actor&&i.roles.includes(actor.role))}))
    .filter(g=>g.items.length),[actor]);
  const active=(href:string)=>href===pathname||(
    href.startsWith("/admin/workspace")&&pathname==="/admin/workspace" &&
    typeof window!=="undefined"&&window.location.search.includes("section="+
      (new URLSearchParams(href.split("?")[1]?.split("#")[0]||"")).get("section")));
  const unread=notes.some(n=>!n.readAt);
  const markRead=async(id:string)=>{
    const response=await fetch("/api/admin/notifications",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});
    if(response.ok)setNotes(old=>old.map(n=>n.id===id?{...n,readAt:new Date().toISOString()}:n));
  };

  return <SessionContext.Provider value={{actor,loading,refresh,signOut}}>
    <div className="imdx-cms">
      {actor&&<><aside className={"imdx-cms-sidebar"+(drawer?" is-open":"")} aria-label="CMS navigation" id="imdx-cms-navigation">
        <div className="imdx-cms-logo">
          <a href="/admin" aria-label="IMDX CMS overview"><img src="/assets/imd-logo-orange.webp" alt="IMDX 2027" width="130" height="52"/></a>
          <span>ORGANIZER CMS</span>
        </div>
        <nav className="imdx-cms-nav">
          {groups.map(g=><div className="imdx-cms-nav-group" key={g.title}>
            <p className="imdx-cms-group-title">{g.title}</p>
            {g.items.map(item=><Link key={item.label} href={item.href}
              className={"imdx-cms-nav-link"+(active(item.href)?" is-active":"")}
              title={item.label} aria-current={active(item.href)?"page":undefined} onClick={()=>setDrawer(false)}>
              <CmsIcon name={item.icon}/><span>{item.label}</span></Link>)}
          </div>)}
        </nav>
        <div className="imdx-cms-side-foot">IMDX 2027 <span>UAT / PRE-LAUNCH</span></div>
      </aside>
      {drawer&&<button className="imdx-cms-overlay" aria-label="Close navigation" type="button" onClick={()=>setDrawer(false)}/>}</>}
      <div className={"imdx-cms-stage"+(!actor?" no-session":"")}>
        {actor&&<header className="imdx-cms-topbar">
          <div className="imdx-cms-top-left">
            <button className="imdx-cms-icon-button imdx-cms-menu" type="button" aria-label="Toggle CMS navigation"
              aria-expanded={drawer} aria-controls="imdx-cms-navigation" onClick={()=>setDrawer(v=>!v)}>
              <CmsIcon name={drawer?"close":"menu"}/>
            </button>
            <div className="imdx-cms-global-search" ref={searchRef}>
              <CmsIcon name="search" size={18}/>
              <input aria-label="Search CMS" placeholder="Search reference, name, email, invoice no."
                value={search} onFocus={()=>setSearchOpen(true)}
                onKeyDown={e=>{if(e.key==="Escape"){setSearchOpen(false);e.currentTarget.blur()}}}
                onChange={e=>{setSearch(e.target.value);setSearchOpen(true)}}/>
              {searchOpen&&search.trim().length>1&&<div className="imdx-cms-search-results" role="region" aria-label="CMS search results">
                {searching?<p>Searching…</p>:results.length?results.map((r,i)=><Link key={i} href={r.href} onClick={()=>{setSearchOpen(false);setSearch("")}}>
                  <span>{r.type}</span><strong>{r.label}</strong><small>{r.hint}</small>
                </Link>):<p>No permitted records matched your search.</p>}
                <button className="imdx-cms-close-search" type="button" onClick={()=>setSearchOpen(false)}>Close results</button>
              </div>}
            </div>
          </div>
          <div className="imdx-cms-top-actions">
            <a className="imdx-cms-website-link" href="/">Back to website <CmsIcon name="arrow" size={16}/></a>
            <div className="imdx-cms-notification-wrap">
              <button className="imdx-cms-icon-button" type="button" aria-label="Notifications"
                aria-expanded={noteOpen} onClick={()=>setNoteOpen(v=>!v)}>
                <CmsIcon name="bell"/>{unread&&<span className="imdx-cms-unread-dot"/>}
              </button>
              {noteOpen&&<div className="imdx-cms-note-popover">
                <strong>Recent notifications</strong>
                {notes.length?notes.slice(0,5).map(n=><div key={n.id} className="imdx-cms-note">
                  {!n.readAt&&<span className="imdx-cms-unread-dot"/>}
                  <div><b>{labelize(n.type)}</b><small>{new Date(n.createdAt).toLocaleString("en-GB",{timeZone:"Asia/Jakarta"})} WIB</small></div>
                  {!n.readAt&&<button type="button" onClick={()=>void markRead(n.id)}>Mark read</button>}
                </div>):<p>No notifications.</p>}
                <Link href="/admin/notifications" onClick={()=>setNoteOpen(false)}>View all notifications</Link>
              </div>}
            </div>
            <div className="imdx-cms-user">
              <span className="imdx-cms-avatar" aria-hidden="true">{actor.email.slice(0,1).toUpperCase()}</span>
              <div><strong>{actor.email.split("@")[0]}</strong><small>{labelize(actor.role)}</small></div>
            </div>
            <button className="imdx-cms-icon-button" type="button" onClick={()=>void signOut()} title="Sign out" aria-label="Sign out"><CmsIcon name="logout"/></button>
          </div>
        </header>}
        {actor&&<div className="imdx-cms-uat-bar" role="note">
          <CmsIcon name="shield" size={16}/><span>UAT environment — no live sales, invoices or admissions are active until owner approvals.</span><b>PRE-GO-LIVE</b>
        </div>}
        {sessionError&&<div role="alert" className="imdx-cms-inline-alert">{sessionError}</div>}
        <div className="imdx-cms-content">
          {loading?<div className="imdx-cms-auth-state">Checking staff access…</div>:
            !actor&&pathname!=="/admin"?<div className="imdx-cms-auth-state">
              <CmsIcon name="shield" size={32}/><h2>Organizer access required</h2>
              <p>Sign in using an authorized staff account to access the CMS.</p>
              <Link href="/admin" className="imdx-cms-primary-link">Sign in to CMS</Link>
            </div>:children}
        </div>
      </div>
    </div>
  </SessionContext.Provider>;
}
