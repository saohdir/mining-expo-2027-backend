import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";import { db } from "@/lib/db";import { otpHash,constantEqual } from "@/lib/security";import { createCustomerSession } from "@/lib/auth";import { failure,HttpError } from "@/lib/errors";
const schema=z.object({challengeId:z.string().uuid(),code:z.string().regex(/^\d{6}$/)}).strict();
export async function POST(req:NextRequest){try{const input=schema.parse(await req.json());const challenge=await db.otpChallenge.findUnique({where:{id:input.challengeId}});if(!challenge||challenge.consumedAt||challenge.expiresAt<new Date()||challenge.attemptCount>=5)throw new HttpError(400,"OTP_INVALID","Code expired or invalid.");
 await db.otpChallenge.update({where:{id:challenge.id},data:{attemptCount:{increment:1}}});
 if(!constantEqual(otpHash(challenge.id,input.code),challenge.codeHash))throw new HttpError(400,"OTP_INVALID","Code expired or invalid.");
 const outcome=await db.$transaction(async tx=>{const consumed=await tx.otpChallenge.updateMany({where:{id:challenge.id,consumedAt:null,attemptCount:{lte:5},expiresAt:{gt:new Date()}},data:{consumedAt:new Date()}});if(consumed.count!==1)throw new HttpError(409,"OTP_ALREADY_USED","Code was already used.");await tx.customerAccount.update({where:{id:challenge.accountId},data:{status:"ACTIVE",...(challenge.channel==="SMS"?{verifiedPhoneAt:new Date()}:{verifiedEmailAt:new Date()})}});return challenge.accountId;});
 await createCustomerSession(outcome);return NextResponse.json({ok:true,next:"/account"},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return failure(e);}}
