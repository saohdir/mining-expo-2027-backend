import {NextResponse} from "next/server";
export async function GET(){return NextResponse.json({emailOtp:process.env.EMAIL_PROVIDER==="smtp"&&Boolean(process.env.SMTP_HOST&&process.env.SMTP_FROM),smsOtp:process.env.SMS_PROVIDER==="twilio"&&Boolean(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN),manualTransferOnly:true,environment:"UAT"},{headers:{"Cache-Control":"no-store"}})}
