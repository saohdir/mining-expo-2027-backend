import {NextRequest,NextResponse} from "next/server";
import {db} from "@/lib/db";import {customer} from "@/lib/auth";import {failure,HttpError} from "@/lib/errors";
export async function POST(_request:NextRequest,{params}:{params:Promise<{id:string}>}){try{
 const account=await customer();const {id}=await params;
 const changed=await db.$transaction(async tx=>{
  const rec=await tx.boothRequest.findFirst({where:{id,accountId:account.id}});
  if(!rec)throw new HttpError(404,"NOT_FOUND","Booth request not found.");
  if(rec.status!=="OFFERED")throw new HttpError(409,"NOT_OFFERED","No offered booth package is awaiting customer acceptance.");
  const result=await tx.boothRequest.updateMany({where:{id,accountId:account.id,status:"OFFERED"},data:{status:"ACCEPTED"}});
  if(result.count!==1)throw new HttpError(409,"ALREADY_CHANGED","Offer was changed; reload.");
  await tx.auditLog.create({data:{accountId:account.id,action:"BOOTH_OFFER_ACCEPTED",resourceType:"BoothRequest",resourceId:id,beforeState:{status:"OFFERED"},afterState:{status:"ACCEPTED"}}});
  await tx.notification.create({data:{audienceRole:"SALES",type:"CUSTOMER_ACCEPTED_BOOTH_OFFER",recordType:"BoothRequest",recordId:id}});
  return result;
 });
 return NextResponse.json({status:"ACCEPTED",message:"Offer accepted; final booth assignment still requires finance and organizer approval.",updated:changed.count},{headers:{"Cache-Control":"private,no-store"}});
 }catch(e){return failure(e)}}
