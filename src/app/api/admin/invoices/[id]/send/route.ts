import {NextRequest,NextResponse} from "next/server";import {z} from "zod";import {db} from "@/lib/db";import {admin} from "@/lib/auth";import {failure,HttpError} from "@/lib/errors";
const schema=z.object({channel:z.enum(["EMAIL","WHATSAPP"]),reason:z.string().min(6).max(250)}).strict();
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{const actor=await admin(["SUPER_ADMIN","FINANCE","SALES"]);const {id}=await params;const x=schema.parse(await req.json());const invoice=await db.invoice.findUnique({where:{id},include:{account:true}});if(!invoice||!["ISSUED","SENT","PARTIALLY_PAID","PAID"].includes(invoice.status))throw new HttpError(409,"NOT_ISSUED","Invoice must be issued before sharing.");const portal=process.env.PUBLIC_BASE_URL||"";
if(x.channel==="WHATSAPP"){
 if(!invoice.account.phone)throw new HttpError(409,"NO_PHONE","Customer has no verified phone.");const phone=invoice.account.phone.replace(/[^\d]/g,"");
 const msg=encodeURIComponent("IMDX 2027 invoice "+invoice.number+" is ready. Sign in securely to your account to review it: "+portal+"/account");
 await db.auditLog.create({data:{adminId:actor.id,action:"INVOICE_WHATSAPP_LINK_CREATED",resourceType:"Invoice",resourceId:id,afterState:{reason:x.reason}}});
 return NextResponse.json({manualComposeUrl:"https://wa.me/"+phone+"?text="+msg,message:"Open link and send the message manually; delivery is not automatic."},{headers:{"Cache-Control":"private,no-store"}});
}
if(process.env.EMAIL_PROVIDER!=="smtp"||!invoice.account.email)throw new HttpError(503,"MAIL_UNAVAILABLE","Configure SMTP and verified customer email before sending.");
await db.$transaction(async tx=>{await tx.notificationOutbox.create({data:{topic:"INVOICE_EMAIL_SEND",dedupeKey:"invoice-email:"+id+":"+Date.now(),payload:{invoiceId:id}}});await tx.invoice.update({where:{id},data:{sentAt:new Date(),status:invoice.status==="ISSUED"?"SENT":invoice.status}});await tx.auditLog.create({data:{adminId:actor.id,action:"INVOICE_EMAIL_QUEUED",resourceType:"Invoice",resourceId:id,afterState:{reason:x.reason}}});});
return NextResponse.json({queued:true,message:"Invoice notification queued. Delivery status must be monitored."},{headers:{"Cache-Control":"private,no-store"}});
}catch(e){return failure(e)}}
