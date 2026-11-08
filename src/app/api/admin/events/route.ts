import {NextRequest,NextResponse} from "next/server";import {z} from "zod";import {db} from "@/lib/db";import {admin} from "@/lib/auth";import {failure,HttpError} from "@/lib/errors";
import {activeEventCode} from "@/lib/active-event";
const schema=z.object({eventCode:z.string().default(activeEventCode),published:z.boolean(),visitorOpen:z.boolean(),reason:z.string().min(8).max(500)}).strict();
export async function GET(){try{await admin(["SUPER_ADMIN","OPERATIONS","CONTENT_EDITOR"]);const events=await db.event.findMany({include:{conferences:true},orderBy:{startsAt:"asc"}});return NextResponse.json({activeEventCode:activeEventCode(),events:events.map(e=>({...e,active:e.code===activeEventCode(),conferences:e.conferences.map(c=>({...c,feeMinor:c.feeMinor?.toString()??null}))}))},{headers:{"Cache-Control":"private,no-store"}})}catch(e){return failure(e)}}
export async function PATCH(req:NextRequest){try{const actor=await admin(["SUPER_ADMIN"]);const x=schema.parse(await req.json());const event=await db.event.findUnique({where:{code:x.eventCode}});if(!event)throw new HttpError(404,"NOT_FOUND","Event missing");const change=await db.$transaction(async tx=>{const e=await tx.event.update({where:{id:event.id},data:{published:x.published,visitorOpen:x.visitorOpen}});await tx.auditLog.create({data:{adminId:actor.id,action:"EVENT_POLICY_CHANGED",resourceType:"Event",resourceId:e.id,beforeState:{published:event.published,visitorOpen:event.visitorOpen},afterState:{published:x.published,visitorOpen:x.visitorOpen,reason:x.reason}}});return e});return NextResponse.json({event:change},{headers:{"Cache-Control":"private,no-store"}})}catch(e){return failure(e)}}
const edition=z.object({code:z.string().regex(/^[A-Z0-9-]{3,30}$/),title:z.string().min(3).max(160),venue:z.string().min(2).max(200),startsAt:z.string().datetime({offset:true}),endsAt:z.string().datetime({offset:true}),cloneFrom:z.string().max(30).optional(),reason:z.string().min(8).max(500)}).strict();
/** FR-041: create a new (unpublished) event edition. Optionally copies reusable SETUP from an earlier edition —
 * booth categories, gates/zones (without staff) and admission policies — never customers, bookings, floorplans or content. */
export async function POST(req:NextRequest){try{const actor=await admin(["SUPER_ADMIN"]);const x=edition.parse(await req.json());
 const startsAt=new Date(x.startsAt),endsAt=new Date(x.endsAt);if(endsAt<=startsAt)throw new HttpError(400,"BAD_DATES","End must be after start.");
 if(await db.event.findUnique({where:{code:x.code}}))throw new HttpError(409,"CODE_IN_USE","An edition with this code exists.");
 const src=x.cloneFrom?await db.event.findUnique({where:{code:x.cloneFrom}}):null;if(x.cloneFrom&&!src)throw new HttpError(404,"NOT_FOUND","Source edition not found.");
 const out=await db.$transaction(async tx=>{const e=await tx.event.create({data:{code:x.code,title:x.title,venue:x.venue,startsAt,endsAt,published:false,visitorOpen:false}});
  const copied={categories:0,gates:0,policies:0};
  if(src){const [cats,gates,pols]=await Promise.all([tx.boothCategory.findMany({where:{eventId:src.id}}),tx.gate.findMany({where:{eventId:src.id}}),tx.admissionPolicy.findMany({where:{eventId:src.id}})]);
   for(const c of cats){await tx.boothCategory.create({data:{eventId:e.id,name:c.name,colorHex:c.colorHex,pattern:c.pattern,sortOrder:c.sortOrder}});copied.categories++;}
   for(const g of gates){await tx.gate.create({data:{eventId:e.id,code:g.code,name:g.name,zones:g.zones,active:g.active}});copied.gates++;}
   for(const p of pols){await tx.admissionPolicy.create({data:{eventId:e.id,zone:p.zone,reentry:p.reentry,updatedBy:actor.id}});copied.policies++;}}
  await tx.auditLog.create({data:{adminId:actor.id,action:"EVENT_EDITION_CREATED",resourceType:"Event",resourceId:e.id,afterState:{code:e.code,cloneFrom:x.cloneFrom||null,copied,reason:x.reason}}});
  return {event:e,copied};});
 return NextResponse.json({...out,activeEventCode:activeEventCode(),note:"Edition created unpublished. Set ACTIVE_EVENT_CODE="+x.code+" when it should become the default edition."},{status:201,headers:{"Cache-Control":"private,no-store"}})}catch(e){return failure(e)}}
