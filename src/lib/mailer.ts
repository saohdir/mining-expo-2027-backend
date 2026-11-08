import nodemailer from "nodemailer";
export async function sendOtp(destination:string,code:string){
 if(process.env.EMAIL_PROVIDER!=="smtp"||!process.env.SMTP_HOST||!process.env.SMTP_FROM||!process.env.SMTP_USER||!process.env.SMTP_PASS)throw new Error("Email OTP provider not configured");
 const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT??587),secure:Number(process.env.SMTP_PORT??587)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
 await transport.sendMail({from:process.env.SMTP_FROM,to:destination,subject:"Your IMDX verification code",text:"Your IMDX 2027 verification code is "+code+". It expires in 5 minutes. Never share this code. If you did not request it, ignore this email."});
}
