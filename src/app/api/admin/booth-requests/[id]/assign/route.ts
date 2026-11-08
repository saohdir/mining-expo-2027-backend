import {NextRequest,NextResponse} from "next/server";import {z} from "zod";import {db} from "@/lib/db";import {admin} from "@/lib/auth";import {failure,HttpError} from "@/lib/errors";import {financeTotals} from "@/lib/policy";
const schema=z.object({boothUnitId:z.string().uuid(),reason:z.string().min(8).max(400),approvedForPublic:z.boolean().default(false)}).strict();
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{const actor=await admin(["OPERATIONS","SUPER_ADMIN"]);const {id}=await params;const x=schema.parse(await req.json());
const assigned=await db.$transaction(async tx=>{
const request=await tx.boothRequest.findUnique({where:{id},include:{invoices:{include:{transfers:true}}}});if(!request)throw new HttpError(404,"NOT_FOUND","Request missing");
if(!["ACCEPTED","WAITING_INVOICE","INVOICED","ALLOCATION_PENDING","CONFIRMED"].includes(request.status))throw new HttpError(409,"NOT_APPROVED","Booth request must be approved.");
const hasPayment=request.invoices.some(inv=>{const p=financeTotals(inv.totalMinor,inv.transfers);return p.state==="PAID_IN_FULL"||(process.env.ALLOW_BOOTH_ALLOCATION_ON_DP==="true"&&p.state==="DP_RECEIVED")});
if(!hasPayment)throw new HttpError(409,"PAYMENT_REQUIRED","Finance must verify the approved payment policy before final booth allocation.");
const unit=await tx.boothUnit.findUnique({where:{id:x.boothUnitId}});if(!unit||unit.floorplanId!==request.floorplanId)throw new HttpError(409,"WRONG_FLOORPLAN","The selected unit belongs to another plan.");
const changed=await tx.boothUnit.updateMany({where:{id:unit.id,status:"AVAILABLE"},data:{status:"OCCUPIED",approvedPublicName:x.approvedForPublic?String((request.companySnapshot as {name?:string}).name||"") :null}});
if(changed.count!==1)throw new HttpError(409,"ALREADY_OCCUPIED","The booth is unavailable.");
const record=await tx.boothAssignment.create({data:{boothUnitId:unit.id,boothRequestId:id,assignedBy:actor.id,approvedForPublic:x.approvedForPublic}});
await tx.boothRequest.update({where:{id},data:{status:"CONFIRMED"}});
await tx.auditLog.create({data:{adminId:actor.id,action:"BOOTH_ASSIGNED",resourceType:"BoothAssignment",resourceId:record.id,afterState:{unitId:unit.id,boothRequestId:id,reason:x.reason}}});
return record;},{isolationLevel:"Serializable"});
return NextResponse.json({assignmentId:assigned.id,boothUnitId:assigned.boothUnitId},{headers:{"Cache-Control":"private,no-store"}});
}catch(e){return failure(e)}}
