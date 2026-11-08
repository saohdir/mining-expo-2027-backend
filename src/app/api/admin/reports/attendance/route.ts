import {NextRequest,NextResponse} from "next/server";
import {db} from "@/lib/db";import {admin} from "@/lib/auth";import {failure,HttpError} from "@/lib/errors";
export async function GET(req:NextRequest){try{
 await admin(["SUPER_ADMIN","OPERATIONS","FINANCE","SALES","VIEWER"]);
 const day=req.nextUrl.searchParams.get("day");
 if(day&&!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new HttpError(400,"BAD_DAY","Day must be YYYY-MM-DD.");
 const event=await db.event.findUnique({where:{code:req.nextUrl.searchParams.get("event")||"IMDX-2027"}});
 if(!event)throw new HttpError(404,"NOT_FOUND","Event not found");
 const [registrations,eligible,admissions,scans]=await Promise.all([
 db.enrollment.findMany({where:{eventId:event.id,type:"VISITOR",status:{notIn:["REJECTED","CANCELLED"]}},select:{accountId:true}}),
 db.enrollment.findMany({where:{eventId:event.id,status:"CONFIRMED"},select:{accountId:true}}),
 db.admission.findMany({where:{pass:{eventId:event.id},...(day?{dayKey:day}:{})},select:{pass:{select:{accountId:true}},dayKey:true,zone:true,gate:true}}),
 db.passScan.count({where:{pass:{eventId:event.id},...(day?{createdAt:{gte:new Date(day+"T00:00:00+07:00"),lt:new Date(Date.parse(day+"T00:00:00+07:00")+86400000)}}:{})}})]);
 return NextResponse.json({event:event.title,registeredUnique:new Set(registrations.map(x=>x.accountId)).size,eligibleUnique:new Set(eligible.map(x=>x.accountId)).size,arrivedUnique:new Set(admissions.map(x=>x.pass.accountId)).size,admissionEntries:admissions.length,scanAttempts:scans,byGate:Object.entries(admissions.reduce<Record<string,number>>((m,x)=>{m[x.gate]=(m[x.gate]||0)+1;return m},{})).map(([gate,count])=>({gate,count}))},{headers:{"Cache-Control":"private,no-store"}});
 }catch(e){return failure(e)}}
