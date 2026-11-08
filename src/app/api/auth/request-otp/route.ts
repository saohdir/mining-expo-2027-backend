import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";import {db} from "@/lib/db";import {failure,HttpError} from "@/lib/errors";
import {requireEnabled} from "@/lib/policy";import {hashToken,otpHash,newOtp,safeEmail} from "@/lib/security";
import {sendOtp} from "@/lib/mailer";import {sendSmsOtp} from "@/lib/sms";import {randomUUID} from "node:crypto";
const schema=z.object({mode:z.enum(["register","login"]),channel:z.enum(["EMAIL","SMS"]),email:z.string().email().optional(),phone:z.string().regex(/^\+[1-9]\d{7,14}$/).optional(),fullName:z.string().min(2).max(120).optional(),consent:z.boolean().optional(),consentVersion:z.string().max(40).optional()}).strict();
export async function POST(req:NextRequest){try{requireEnabled("registration");const x=schema.parse(await req.json());
 const destination=x.channel==="EMAIL"?safeEmail(x.email||""):x.phone||"";
 if(x.channel==="EMAIL"&&!x.email||x.channel==="SMS"&&!x.phone)throw new HttpError(400,"CONTACT_REQUIRED","Enter a valid email or phone.");
 if(x.channel==="SMS"&&process.env.SMS_PROVIDER!=="twilio")throw new HttpError(503,"SMS_UNAVAILABLE","SMS OTP is not configured; choose email.");
 if(x.channel==="EMAIL"&&process.env.EMAIL_PROVIDER!=="smtp")throw new HttpError(503,"EMAIL_UNAVAILABLE","Email OTP not configured.");
 const recent=await db.otpChallenge.count({where:{destinationHash:hashToken(destination),createdAt:{gte:new Date(Date.now()-3600000)}}});
 if(recent>=5)throw new HttpError(429,"OTP_RATE_LIMIT","Too many verification attempts. Try later.");
 let account=await db.customerAccount.findFirst({where:x.channel==="EMAIL"?{email:destination}:{phone:destination}});
 if(x.mode==="register"){
 if(!x.fullName||!x.consent||!x.consentVersion)throw new HttpError(400,"CONSENT_REQUIRED","Name and privacy consent required.");
 if(account?.status==="ACTIVE")throw new HttpError(409,"ACCOUNT_EXISTS","Account exists. Please sign in.");
 if(!account)account=await db.customerAccount.create({data:{...(x.channel==="EMAIL"?{email:destination}:{phone:destination}),profile:{create:{fullName:x.fullName,consentAt:new Date(),consentVersion:x.consentVersion}}}});
 }
 if(!account)return NextResponse.json({message:"If the account exists, a code will be sent."},{headers:{"Cache-Control":"no-store"}});
 const id=randomUUID(),code=newOtp();
 const challenge=await db.otpChallenge.create({data:{id,accountId:account.id,channel:x.channel,destinationHash:hashToken(destination),codeHash:otpHash(id,code),expiresAt:new Date(Date.now()+5*60000)}});
 try{if(x.channel==="SMS")await sendSmsOtp(destination,code);else await sendOtp(destination,code)}catch{await db.otpChallenge.deleteMany({where:{id}});throw new HttpError(503,"DELIVERY_UNAVAILABLE","Verification message could not be sent.");}
 return NextResponse.json({message:"Verification code sent.",challengeId:id,expiresInSeconds:300},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return failure(e)}}
