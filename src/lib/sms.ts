import {sendMail} from "./mailer";
/** UAT stand-in: SMS_PROVIDER=mailpit delivers the text to Mailpit as an e-mail to <digits>@sms.uat.invalid (no real SMS). */
export const smsAvailable=()=>process.env.SMS_PROVIDER==="mailpit"||(process.env.SMS_PROVIDER==="twilio"&&Boolean(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_FROM));
export async function sendSmsOtp(number:string,code:string){
 if(process.env.SMS_PROVIDER==="mailpit"){await sendMail(number.replace(/[^\d]/g,"")+"@sms.uat.invalid","[SMS UAT] IMDX 2027 verification code","Your IMDX 2027 verification code is "+code+". It expires in 5 minutes.");return;}
 if(process.env.SMS_PROVIDER!=="twilio")throw new Error("SMS provider unavailable");
 const sid=process.env.TWILIO_ACCOUNT_SID,token=process.env.TWILIO_AUTH_TOKEN,from=process.env.TWILIO_FROM;
 if(!sid||!token||!from)throw new Error("SMS provider credentials missing");
 const body=new URLSearchParams({To:number,From:from,Body:"Your IMDX 2027 verification code is "+code+". It expires in 5 minutes."});
 const response=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+encodeURIComponent(sid)+"/Messages.json",{method:"POST",headers:{"Authorization":"Basic "+Buffer.from(sid+":"+token).toString("base64"),"Content-Type":"application/x-www-form-urlencoded"},body:body.toString(),cache:"no-store"});
 if(!response.ok)throw new Error("SMS provider declined verification delivery");
}
