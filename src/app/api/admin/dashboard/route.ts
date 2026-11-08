import {NextRequest,NextResponse} from "next/server";
import {Prisma, type AdminRole} from "@prisma/client";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure,HttpError} from "@/lib/errors";

const PRESETS=["today","week","month","custom"] as const;
type Preset=typeof PRESETS[number];
const isDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&
  new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s;
const wibDate=(d:Date)=>{
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  const get=(k:string)=>parts.find(p=>p.type===k)?.value||"";
  return get("year")+"-"+get("month")+"-"+get("day");
};
const wibStart=(s:string)=>new Date(s+"T00:00:00+07:00");
function getPeriod(params:URLSearchParams){
  const raw=params.get("period")||"month";
  if(!PRESETS.includes(raw as Preset))throw new HttpError(400,"BAD_PERIOD","Unsupported period.");
  const preset=raw as Preset;
  const now=wibDate(new Date());
  let from=now,to=now;
  if(preset==="week"){
    const day=new Date(now+"T00:00:00Z").getUTCDay();
    from=new Date(Date.parse(now+"T00:00:00Z")-((day+6)%7)*86400000).toISOString().slice(0,10);
  }else if(preset==="month"){from=now.slice(0,7)+"-01"}
  else if(preset==="custom"){from=params.get("from")||"";to=params.get("to")||""}
  if(!isDate(from)||!isDate(to)||from>to)throw new HttpError(400,"BAD_DATE","Use valid inclusive WIB date boundaries.");
  if(Date.parse(to)-Date.parse(from)>366*86400000)throw new HttpError(400,"DATE_RANGE","Maximum period is 366 days.");
  const gte=wibStart(from);
  const lt=new Date(wibStart(to).getTime()+86400000);
  return {preset,from,to,date:{gte,lt},basis:"createdAt",timezone:"Asia/Jakarta"};
}
type QueueItem={type:string;reference:string;label:string;createdAt:Date;href:string;action:string};
const idr=(v:bigint|number|null|undefined)=>"Rp "+Number(v??0n).toLocaleString("id-ID");
const metric=(key:string,label:string,value:string|number,caption:string,icon:string,accent=false)=>({key,label,value,caption,icon,accent});
const ROLES={
  all:["SUPER_ADMIN","SALES","FINANCE","OPERATIONS","CONTENT_EDITOR","CHECKIN_STAFF","VIEWER"] as AdminRole[],
  sales:["SUPER_ADMIN","SALES"] as AdminRole[],
  finance:["SUPER_ADMIN","FINANCE"] as AdminRole[],
  ops:["SUPER_ADMIN","OPERATIONS"] as AdminRole[]
};

export async function GET(req:NextRequest){
  try{
    const actor=await admin();
    const eventCode=req.nextUrl.searchParams.get("event")||"IMDX-2027";
    const period=getPeriod(req.nextUrl.searchParams);
    const event=await db.event.findUnique({where:{code:eventCode},select:{id:true,title:true}});
    if(!event)throw new HttpError(404,"EVENT_NOT_FOUND","Event is not configured.");
    const created={createdAt:period.date};
    const entryWhere={eventId:event.id,...created};
    const invoiceWhere:Prisma.InvoiceWhereInput={
      OR:[{enrollment:{eventId:event.id}},{boothRequest:{eventId:event.id}}],
      issuedAt:period.date
    };
    const scanWhere:Prisma.PassScanWhereInput={
      createdAt:period.date,pass:{eventId:event.id},result:{not:"VALID_ACCEPTED"}
    };
    const [
      accounts,visitor,conference,exhibitor,boothCount,pendingRequest,
      issued,invoiceTotal,uniqueAdmissions,acceptedEntries,rejectedScans,
      boothQueue,manualQueue,allocationQueue,notifications,inventory,activeHolds,
      boothNeedsCount,allocationNeedsCount,programmeDrafts,programmeTba
    ]=await Promise.all([
      db.customerAccount.count({where:{status:"ACTIVE",...created}}),
      db.enrollment.count({where:{...entryWhere,type:"VISITOR"}}),
      db.enrollment.count({where:{...entryWhere,type:"CONFERENCE"}}),
      db.enrollment.count({where:{...entryWhere,type:"EXHIBITOR"}}),
      db.boothRequest.count({where:{...entryWhere}}),
      db.manualPaymentRequest.count({where:{status:"NEW",...created}}),
      db.invoice.count({where:invoiceWhere}),
      db.invoice.aggregate({where:invoiceWhere,_sum:{totalMinor:true}}),
      db.$queryRaw<{total:bigint}[]>(Prisma.sql`
        SELECT COUNT(DISTINCT p."accountId")::bigint AS total
        FROM "Admission" a JOIN "EventPass" p ON p."id"=a."passId"
        WHERE p."eventId"=${event.id}
        AND a."admittedAt" >= ${period.date.gte}
        AND a."admittedAt" < ${period.date.lt}
      `),
      db.admission.count({where:{admittedAt:period.date,pass:{eventId:event.id}}}),
      db.passScan.count({where:scanWhere}),
      db.boothRequest.findMany({
        where:{...entryWhere,status:{in:["NEW","UNDER_REVIEW"]}},
        orderBy:{createdAt:"asc"},take:8,select:{id:true,status:true,createdAt:true}
      }),
      db.manualPaymentRequest.findMany({
        where:{status:"NEW",...created},
        orderBy:{createdAt:"asc"},take:8,select:{id:true,createdAt:true}
      }),
      db.boothRequest.findMany({
        where:{...entryWhere,status:{in:["ACCEPTED","WAITING_INVOICE","INVOICED","ALLOCATION_PENDING"]}},
        orderBy:{createdAt:"asc"},take:8,select:{id:true,status:true,createdAt:true}
      }),
      db.notification.findMany({
        where:actor.role==="SUPER_ADMIN"?{}:{audienceRole:actor.role},
        select:{id:true,type:true,recordId:true,readAt:true,createdAt:true},
        take:6,orderBy:{createdAt:"desc"}
      }),
      db.boothUnit.findMany({
        where:{floorplan:{eventId:event.id,status:"PUBLISHED"}},
        select:{areaSqm:true,status:true}
      }),
      db.boothHold.count({
        where:{status:"ACTIVE",boothUnit:{floorplan:{eventId:event.id}},
          expiresAt:{lte:new Date(Date.now()+24*3600000)}}
      }),
      db.boothRequest.count({
        where:{...entryWhere,status:{in:["NEW","UNDER_REVIEW"]}}
      }),
      db.boothRequest.count({
        where:{...entryWhere,status:{in:["ACCEPTED","WAITING_INVOICE","INVOICED","ALLOCATION_PENDING"]}}
      }),
      db.conference.count({where:{eventId:event.id,published:false}}),
      db.conference.count({where:{eventId:event.id,OR:[{capacity:null},{feeMinor:null}]}})
    ]);
    const totalArea=inventory.reduce((s,u)=>s+Number(u.areaSqm),0);
    const availableArea=inventory.filter(u=>u.status==="AVAILABLE").reduce((s,u)=>s+Number(u.areaSqm),0);
    const occupiedArea=inventory.filter(u=>u.status==="OCCUPIED").reduce((s,u)=>s+Number(u.areaSqm),0);
    const occupiedPct=totalArea?Math.round(occupiedArea*1000/totalArea)/10:0;
    const role=actor.role;
    const needsCount=role==="SUPER_ADMIN"?pendingRequest+boothNeedsCount+allocationNeedsCount:
      role==="SALES"?pendingRequest+boothNeedsCount:
      role==="FINANCE"?pendingRequest:
      role==="OPERATIONS"?boothNeedsCount+allocationNeedsCount:0;
    const actionQueue:QueueItem[]=[];
    if(["SUPER_ADMIN","SALES","FINANCE"].includes(role)) for(const p of manualQueue)
      actionQueue.push({type:"Manual payment request",reference:p.id.slice(0,8),label:"New manual invoice request",createdAt:p.createdAt,
        href:"/admin/workspace?section=finance",action:"Review"});
    if(["SUPER_ADMIN","SALES","OPERATIONS"].includes(role)) for(const b of boothQueue)
      actionQueue.push({type:"Booth review",reference:b.id.slice(0,8),label:b.status==="NEW"?"New booth request":"Booth review in progress",
        createdAt:b.createdAt,href:"/admin/booths",action:"Review"});
    if(["SUPER_ADMIN","OPERATIONS"].includes(role)) for(const b of allocationQueue)
      actionQueue.push({type:"Allocation review",reference:b.id.slice(0,8),label:"Check Finance approval and unit assignment",
        createdAt:b.createdAt,href:"/admin/booths",action:"Inspect"});
    actionQueue.sort((a,b)=>+a.createdAt-+b.createdAt);
    const actionItems=actionQueue.slice(0,8).map(q=>({...q,createdAt:q.createdAt.toISOString()}));
    const metricSets:Record<string,ReturnType<typeof metric>[]> = {
      SUPER_ADMIN:[
        metric("action","Needs action",needsCount,"Open queue records created in selected period", "bell",true),
        metric("account","Verified accounts",accounts,"ACTIVE accounts created in period · platform scope","users"),
        metric("visitor","Visitor registrations",visitor,"Visitor enrollments created · event", "tickets"),
        metric("conference","Conference bookings",conference,"Conference enrollments created · event","calendar"),
        metric("booth","Booth requests",boothCount,"Requests created · event","booths"),
        metric("invoices","Issued invoice value",idr(invoiceTotal._sum.totalMinor),"Invoices issued in period · event; gross, not receipts","invoice"),
        metric("admitted","Unique admitted",Number(uniqueAdmissions[0]?.total||0n),"Distinct accounts admitted · event","check"),
        metric("rejected","Rejected scan attempts",rejectedScans,"Event-linked non-accepted scans · period","scan")
      ],
      SALES:[
        metric("action","Needs action",needsCount,"Open sales queues created in selected period","bell",true),
        metric("booth","Booth requests",boothCount,"Requests created · event","booths"),
        metric("review","Booth reviews",boothQueue.length,"NEW / UNDER_REVIEW · first 8 in period","request"),
        metric("conference","Conference bookings",conference,"Conference enrollments created · event","calendar"),
        metric("invoice","Issued invoices",issued,"Issued in period · event; read-only summary","invoice")
      ],
      FINANCE:[
        metric("action","Needs action",needsCount,"Open manual invoice requests created in period","bell",true),
        metric("manual","Pending payment requests",pendingRequest,"NEW manual requests created · platform scope","request"),
        metric("issued","Issued invoices",issued,"Invoices issued in period · event","invoice"),
        metric("total","Invoice face value",idr(invoiceTotal._sum.totalMinor),"Gross issued total, not verified receipts","payments")
      ],
      OPERATIONS:[
        metric("action","Needs action",needsCount,"Open Operations queues created in period","bell",true),
        metric("booth","Booth requests",boothCount,"Created · event","booths"),
        metric("available","Available booth area",availableArea.toLocaleString("id-ID")+" m²","Current published map · unreserved","floorplan"),
        metric("occupied","Occupied area",occupiedPct+"%","Current published map · area basis","box"),
        metric("holds","Holds expiring soon",activeHolds,"Active holds expiring within 24h · live","clock"),
        metric("admitted","Unique admitted",Number(uniqueAdmissions[0]?.total||0n),"Distinct accounts admitted · selected period","users"),
        metric("entries","Accepted entries",acceptedEntries,"Successful admissions · selected period","check"),
        metric("rejected","Rejected scan attempts",rejectedScans,"Event-linked non-accepted scans · period","scan")
      ],
      CONTENT_EDITOR:[
        metric("programmes","Draft programmes",programmeDrafts,"Currently unpublished · event scope","calendar"),
        metric("tba","Programmes with TBA",programmeTba,"Missing approved fee or capacity · current event","clock")
      ],
      VIEWER:[
        metric("visitor","Visitor registrations",visitor,"Enrollments created · selected event and period","tickets"),
        metric("conference","Conference bookings",conference,"Enrollments created · selected event and period","calendar"),
        metric("booths","Booth requests",boothCount,"Created · selected period","booths"),
        metric("admitted","Unique admitted",Number(uniqueAdmissions[0]?.total||0n),"Distinct accounts admitted · selected period","users"),
        metric("occupied","Occupied area",occupiedPct+"%","Current published map · area basis","floorplan")
      ],
      CHECKIN_STAFF:[]
    };
    return NextResponse.json({
      event:event.title,role,period:{preset:period.preset,from:period.from,to:period.to,basis:"Created / admission / issued date as labeled",timezone:"WIB (UTC+7)"},
      metrics:metricSets[role]||[],
      queue:actionItems,
      notifications:role==="CHECKIN_STAFF"?[]:notifications,
      details:role==="VIEWER"||role==="CONTENT_EDITOR"||role==="CHECKIN_STAFF"?
        {occupiedAreaSqm:occupiedArea,exhibitorEnrollments:exhibitor}:
        {issuedInvoiceCount:issued,invoiceValueMinor:String(invoiceTotal._sum.totalMinor??0n),occupiedAreaSqm:occupiedArea,exhibitorEnrollments:exhibitor}
    },{headers:{"Cache-Control":"private,no-store"}});
  }catch(e){return failure(e)}
}
