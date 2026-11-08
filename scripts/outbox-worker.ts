import {expireBoothHolds} from "../src/lib/booth-hold-expiry";
import {PrismaClient} from "@prisma/client";
import nodemailer from "nodemailer";
const db=new PrismaClient();
const portal=process.env.PUBLIC_BASE_URL||"https://localhost";
const toAdmin=process.env.ADMIN_NOTIFICATION_EMAIL||"";
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const deliver=async(to:string,subject:string,body:string)=>{
 if(!to||process.env.EMAIL_PROVIDER!=="smtp"||!process.env.SMTP_HOST||!process.env.SMTP_FROM)throw Error("Email transport not configured.");
 const port=Number(process.env.SMTP_PORT||587);
 const credentials=process.env.SMTP_USER&&process.env.SMTP_PASS?{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}:{};
 const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:port===465,...credentials});
 await transport.sendMail({from:process.env.SMTP_FROM,to,subject,text:body});
};
type Payload={id?:string;invoiceId?:string;boothRequestId?:string};
async function processJob(topic:string,p:Payload){
 if(["BOOTH_REQUEST_RECEIVED","BOOTH_STATUS_UPDATED"].includes(topic)){const id=p.boothRequestId||p.id;if(!id)throw Error("Missing booth request id");
 const b=await db.boothRequest.findUnique({where:{id},include:{account:true}});
 if(!b)throw Error("Booth request missing");
 if(topic==="BOOTH_REQUEST_RECEIVED")return deliver(toAdmin,"IMDX 2027 — new exhibitor booth request","A new exhibitor booth request requires review in the secure CMS. Reference: "+id+"\nOpen: "+portal+"/admin");
 if(b.account.email)return deliver(b.account.email,"IMDX booth request status","Your IMDX 2027 booth request status changed to "+b.status+". Sign in to view details: "+portal+"/account");return;
 }
 if(["BOOTH_OFFER_READY","BOOTH_ASSIGNED"].includes(topic)){
  const requestId=p.boothRequestId;
  if(!requestId)throw Error("Missing booth request reference");
  const booking=await db.boothRequest.findUnique({where:{id:requestId},include:{account:true}});
  if(!booking)throw Error("Booth request missing");
  if(!booking.account.email)return;
  return deliver(booking.account.email,
    topic==="BOOTH_OFFER_READY"?"IMDX — revised booth quotation":"IMDX — booth allocation update",
    topic==="BOOTH_OFFER_READY"?
      "An organizer quotation is ready for your review. Sign in to view the latest revision and accept it if appropriate: "+portal+"/account":
      "Your IMDX booth allocation has been updated. Sign in to view the approved units: "+portal+"/account");
 }
 if(topic==="ENROLLMENT_REVIEWED"){const id=(p as Payload & {enrollmentId?:string}).enrollmentId;if(!id)throw Error("Registration id missing");const r=await db.enrollment.findUnique({where:{id},include:{account:true}});if(!r||!r.account.email)throw Error("Missing registration email");return deliver(r.account.email,"IMDX registration decision","Your "+r.type+" registration is now "+r.status+". Sign in to your dashboard: "+portal+"/account");}
 if(topic==="MANUAL_PAYMENT_REQUEST"){if(!p.id)throw Error("Missing payment request id");return deliver(toAdmin,"IMDX 2027 — manual invoice requested","A customer has requested manual bank-transfer billing. Open CMS to review and issue an invoice. Reference: "+p.id+"\n"+portal+"/admin");}
 if(["INVOICE_ISSUED","INVOICE_EMAIL_SEND","PAYMENT_VERIFIED"].includes(topic)){if(!p.invoiceId)throw Error("Missing invoice id");
 const inv=await db.invoice.findUnique({where:{id:p.invoiceId},include:{account:true}});if(!inv||!inv.account.email)throw Error("Invoice/customer email unavailable");
 if(topic==="PAYMENT_VERIFIED")return deliver(inv.account.email,"IMDX — payment status updated","Finance has reviewed a manual transfer on your invoice "+inv.number+". Sign in to view your current confirmed balance: "+portal+"/account");
 return deliver(inv.account.email,"IMDX — invoice ready","Your IMDX 2027 invoice "+inv.number+" is ready in the secure customer portal. Sign in: "+portal+"/account\nNever transfer based on an unverified message alone.");
 }
 throw Error("Unhandled topic: "+topic);
}
async function drain(){
 const jobs=await db.notificationOutbox.findMany({where:{state:{in:["QUEUED","FAILED"]},nextRunAt:{lte:new Date()},attempts:{lt:5}},orderBy:{createdAt:"asc"},take:20});
 for(const job of jobs){const claim=await db.notificationOutbox.updateMany({where:{id:job.id,state:{in:["QUEUED","FAILED"]}},data:{state:"PROCESSING",attempts:{increment:1}}});
 if(claim.count!==1)continue;
 try{await processJob(job.topic,job.payload as Payload);await db.notificationOutbox.update({where:{id:job.id},data:{state:"SENT"}});}
 catch(e){const waitingMs=Math.min(30*60*1000,30000*2**job.attempts);await db.notificationOutbox.update({where:{id:job.id},data:{state:"FAILED",nextRunAt:new Date(Date.now()+waitingMs)}});console.error("Outbox delivery failed for topic",job.topic,"record",job.id);}
 }
}
async function main(){console.info("IMDX outbox worker launched");while(true){try{await expireBoothHolds(db);await drain()}catch(e){console.error("Worker cycle error",e instanceof Error?e.message:"unknown")}await delay(20000)}}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>db.$disconnect());
