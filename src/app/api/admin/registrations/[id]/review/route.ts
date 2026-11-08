import {NextRequest,NextResponse} from "next/server";import {z} from "zod";
import {db} from "@/lib/db";import {admin} from "@/lib/auth";import {failure,HttpError} from "@/lib/errors";
import {financeTotals} from "@/lib/policy";
const schema=z.object({decision:z.enum(["CONFIRMED","REJECTED"]),reason:z.string().min(8).max(500)}).strict();
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{
 const actor=await admin(["SUPER_ADMIN","OPERATIONS"]);const {id}=await params;const x=schema.parse(await req.json());
 const result=await db.$transaction(async tx=>{
  const enrollment=await tx.enrollment.findUnique({where:{id},include:{conference:true,invoices:{include:{transfers:true,adjustments:true}}}});
  if(!enrollment)throw new HttpError(404,"NOT_FOUND","Registration not found.");
  if(enrollment.status==="CONFIRMED"||enrollment.status==="CANCELLED"||enrollment.status==="REJECTED")throw new HttpError(409,"FINAL_STATE","This registration is already in a final state.");
  if(enrollment.type==="VISITOR"&&x.decision==="CONFIRMED")throw new HttpError(409,"VISITOR_POLICY","Visitor confirmation uses the approved visitor entry policy.");
  if(enrollment.type==="EXHIBITOR"&&x.decision==="CONFIRMED")throw new HttpError(409,"EXHIBITOR_POLICY","Exhibitor confirmation follows the booth allocation workflow.");
  if(x.decision==="CONFIRMED"&&enrollment.type==="CONFERENCE"){
   if(!enrollment.conference||enrollment.conference.feeMinor===null)throw new HttpError(409,"FEE_NOT_APPROVED","Conference fee must be published explicitly (including zero for free).");
   const paid=enrollment.invoices.some(inv=>inv.status==="PAID"&&financeTotals(inv.totalMinor,inv.transfers,inv.adjustments.filter(r=>r.type==="REVERSAL").map(r=>r.amountMinor)).state==="PAID_IN_FULL");
   if(enrollment.conference.feeMinor>0n&&!paid)throw new HttpError(409,"PAYMENT_REQUIRED","Conference invoice is not fully verified by Finance.");
  }
  const changed=await tx.enrollment.update({where:{id},data:{status:x.decision,confirmedAt:x.decision==="CONFIRMED"?new Date():undefined}});
  await tx.auditLog.create({data:{adminId:actor.id,action:"ENROLLMENT_REVIEW",resourceType:"Enrollment",resourceId:id,beforeState:{status:enrollment.status},afterState:{decision:x.decision,reason:x.reason}}});
  await tx.notificationOutbox.create({data:{topic:"ENROLLMENT_REVIEWED",dedupeKey:"registration:"+id+":"+x.decision,payload:{enrollmentId:id,decision:x.decision}}});
  return changed;
 },{isolationLevel:"Serializable"});
 return NextResponse.json({id:result.id,status:result.status},{headers:{"Cache-Control":"private,no-store"}});
 }catch(e){return failure(e)}}
