import nodemailer from "nodemailer";
export async function sendMail(to:string,subject:string,body:string){
 const host=process.env.SMTP_HOST,from=process.env.SMTP_FROM;
 if(process.env.EMAIL_PROVIDER!=="smtp"||!host||!from)throw new Error("SMTP provider unavailable");
 const port=Number(process.env.SMTP_PORT||587);
 const auth=process.env.SMTP_USER&&process.env.SMTP_PASS?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined;
 const transport=nodemailer.createTransport({host,port,secure:port===465,...(auth?{auth}:{})});
 await transport.sendMail({from,to,subject,text:body});
}
export async function sendOtp(destination:string,code:string){return sendMail(destination,"IMDX 2027 verification code","Your verification code is "+code+". Expires in five minutes. Never share this code.");}
