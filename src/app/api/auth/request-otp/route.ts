import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { failure,HttpError } from "@/lib/errors";
import { requireEnabled } from "@/lib/policy";
import { hashToken,otpHash,newOtp,safeEmail } from "@/lib/security";
import { sendOtp } from "@/lib/mailer";
import { randomUUID } from "node:crypto";
const schema=z.object({mode:z.enum(["register","login"]),channel:z.enum(["EMAIL","SMS"]),email:z.string().email().optional(),phone:z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),fullName:z.string().min(2).max(120).optional(),consent:z.boolean().optional(),consentVersion:z.string().max(40).optional()}).strict();
export async function POST(req:NextRequest){try{
 requireEnabled("registration");const data=schema.parse(await req.json());
 if(data.channel==="SMS")throw new HttpError(503,"SMS_NOT_CONFIGURED","SMS OTP is unavailable until an approved provider is configured. Choose email.");
 if(!data.email)throw new HttpError(400,"EMAIL_REQUIRED","Email is required.");
 if(process.env.EMAIL_PROVIDER!=="smtp")throw new HttpError(503,"EMAIL_NOT_CONFIGURED","Email verification provider is not configured.");
 const email=safeEmail(data.email);const cutoff=new Date(Date.now()-60*60*1000);
 const tooMany=await db.otpChallenge.count({where:{destinationHash:hashToken(email),createdAt:{gte:cutoff}}});
 if(tooMany>=5)throw new HttpError(429,"OTP_RATE_LIMIT","Too many verification attempts. Try later.");
 let account=await db.customerAccount.findUnique({where:{email}});
 if(data.mode==="register"){
   if(!data.fullName||!data.consent||!data.consentVersion)throw new HttpError(400,"CONSENT_REQUIRED","Name and privacy consent are required.");
   if(account?.status==="ACTIVE")throw new HttpError(409,"ACCOUNT_EXISTS","Account exists. Please sign in.");
   if(!account)account=await db.customerAccount.create({data:{email,profile:{create:{fullName:data.fullName,consentAt:new Date(),consentVersion:data.consentVersion}}}});
 }
 if(!account)return NextResponse.json({message:"If the account exists, a code will be sent."},{headers:{"Cache-Control":"no-store"}});
 const id=randomUUID(),code=newOtp();const challenge=await db.otpChallenge.create({data:{id,accountId:account.id,channel:"EMAIL",destinationHash:hashToken(email),codeHash:otpHash(id,code),expiresAt:new Date(Date.now()+5*60000)}});
 try{await sendOtp(email,code);}catch(e){await db.otpChallenge.delete({where:{id:challenge.id}});console.error("OTP delivery unavailable");throw new HttpError(503,"DELIVERY_UNAVAILABLE","Verification email could not be delivered.");}
 return NextResponse.json({message:"Verification code sent.",challengeId:id,expiresInSeconds:300},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return failure(e);}}
