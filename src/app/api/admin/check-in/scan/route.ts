import {NextRequest,NextResponse} from "next/server";import {z} from "zod";import {db} from "@/lib/db";import {admin} from "@/lib/auth";import {hashToken} from "@/lib/security";import {isoWibDate,requireEnabled} from "@/lib/policy";import {failure,HttpError} from "@/lib/errors";
const input=z.object({token:z.string().min(20).max(300),gate:z.string().min(1).max(60),zone:z.string().min(1).max(60).default("EXPO_ENTRY")}).strict();
export async function POST(req:NextRequest){try{
 requireEnabled("admission");const operator=await admin(["CHECKIN_STAFF","OPERATIONS","SUPER_ADMIN"]);
 const data=input.parse(await req.json());const tokenHash=hashToken(data.token.trim());const pass=await db.eventPass.findUnique({where:{tokenHash},include:{enrollment:true,account:{include:{profile:true}},event:true}});
 if(!pass){return NextResponse.json({result:"INVALID",message:"Invalid QR code."},{status:422,headers:{"Cache-Control":"no-store"}})}
 let result:"VALID_ACCEPTED"|"ALREADY_CHECKED_IN"|"WRONG_ZONE"|"NOT_YET_VALID"|"EXPIRED"|"REVOKED"|"UNPAID"="VALID_ACCEPTED";
 const now=new Date();
 if(pass.status==="REVOKED")result="REVOKED";
 else if(pass.status==="EXPIRED"||now>pass.expiresAt)result="EXPIRED";
 else if(now<pass.event.startsAt)result="NOT_YET_VALID";
 else if(pass.entitlement!==data.zone&&pass.entitlement!=="ALL_ACCESS")result="WRONG_ZONE";
 else if(pass.enrollment.status!=="CONFIRMED")result="UNPAID";
 else {
 const snap=pass.enrollment.profileSnapshot as {fullName?:string};
 const current=pass.account.profile?.fullName.trim().toLocaleLowerCase("en-US");
 if(!current||current!==snap?.fullName?.trim().toLocaleLowerCase("en-US"))result="REVOKED";
 }
 const dayKey=isoWibDate(now);
 if(result==="VALID_ACCEPTED"){
 try{
 await db.$transaction(async tx=>{
 await tx.admission.create({data:{passId:pass.id,zone:data.zone,dayKey,gate:data.gate,admittedBy:operator.id}});
 await tx.passScan.create({data:{passId:pass.id,gate:data.gate,zone:data.zone,scannedBy:operator.id,result:"VALID_ACCEPTED"}});
 },{isolationLevel:"Serializable"});
 }catch(e){if(typeof e==="object"&&e!==null&&"code" in e&&e.code==="P2002"){result="ALREADY_CHECKED_IN";}else throw e}
 }
 if(result!=="VALID_ACCEPTED"){
 await db.passScan.create({data:{passId:pass.id,gate:data.gate,zone:data.zone,result,scannedBy:operator.id}});
 }
 return NextResponse.json({result,admitted:result==="VALID_ACCEPTED",person:result==="VALID_ACCEPTED"?{uniqueId:pass.account.id,name:pass.account.profile?.fullName,access:pass.entitlement}:undefined,message:result==="VALID_ACCEPTED"?"Admission confirmed.":result==="ALREADY_CHECKED_IN"?"Already checked in for this zone/day.":"Access denied: "+result},{status:result==="VALID_ACCEPTED"?200:422,headers:{"Cache-Control":"private,no-store"}});
 }catch(e){return failure(e)}}
