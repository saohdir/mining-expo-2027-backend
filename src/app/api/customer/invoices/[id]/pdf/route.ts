import {NextRequest,NextResponse} from "next/server";
import {PDFDocument,StandardFonts,rgb} from "pdf-lib";import {db} from "@/lib/db";import {customer} from "@/lib/auth";import {financeTotals,bankDetails} from "@/lib/policy";import {failure,HttpError} from "@/lib/errors";
export const runtime="nodejs";
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){try{const acc=await customer();const {id}=await params;
 const inv=await db.invoice.findFirst({where:{id,accountId:acc.id,status:{not:"DRAFT"}},include:{items:true,transfers:true,adjustments:true,account:{include:{profile:true}}}});
 if(!inv)throw new HttpError(404,"NOT_FOUND","Invoice not available.");
 const totals=financeTotals(inv.totalMinor,inv.transfers,inv.adjustments.filter(r=>r.type==="REVERSAL").map(r=>r.amountMinor));const pdf=await PDFDocument.create();const page=pdf.addPage([595,842]);const font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 let y=792;const text=(s:string,size=11,isBold=false)=>{page.drawText(s.replace(/[^\x20-\x7E]/g,"?").slice(0,100),{x:44,y,size,font:isBold?bold:font,color:rgb(.25,.12,.07)});y-=size+14};
 text("IMDX 2027 - Invoice",21,true);text("Invoice: "+inv.number,13,true);text("Status: "+inv.status+(["CANCELLED","VOID"].includes(inv.status)?" (cancelled"+(totals.paidMinor!=="0"?"; refund handled separately":"")+")":""),12);
 text("Issued: "+(inv.issuedAt?.toISOString().slice(0,10)||"Pending"),10);text("Customer: "+(inv.account.profile?.fullName||inv.account.email||""),10);
 text("Event venue: JIEXPO Kemayoran, Jakarta",10);y-=12;text("Items",13,true);
 const lines=inv.items.filter(i=>i.kind==="ITEM"),extra=inv.items.filter(i=>i.kind!=="ITEM");
 for(const item of lines){text(item.description+" ("+item.quantity+" x IDR "+item.unitPriceMinor.toString()+")",10);}
 // FR-125: configured taxes/fees are shown as their own lines under the subtotal.
 if(extra.length){text("Subtotal: IDR "+lines.reduce((a,i)=>a+i.amountMinor,0n).toString(),10,true);for(const c of extra)text((c.kind==="TAX"?"Tax: ":"Fee: ")+c.description+" IDR "+c.amountMinor.toString(),10);}
 y-=10;text("Total: IDR "+inv.totalMinor.toString(),14,true);text("Confirmed receipts: IDR "+totals.paidMinor,11);text("Outstanding: IDR "+totals.outstandingMinor,11);
 if(!["CANCELLED","VOID"].includes(inv.status)){const b=bankDetails();y-=15;text("BANK TRANSFER INSTRUCTIONS",12,true);text("Bank: "+b.name,11);text("Account holder: "+b.owner,11);text("Account number: "+b.number,11);}
 y-=24;
 text("Payments are confirmed only after the Finance team verifies bank records.",9);
 if(process.env.APP_STAGE!=="production"){page.drawText("UAT / NOT VALID FOR REAL PAYMENT",{x:65,y:60,size:18,font:bold,color:rgb(.7,.25,.1)})}
 return new NextResponse(new Uint8Array(await pdf.save()),{headers:{"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="imdx-invoice.pdf"',"Cache-Control":"private,no-store"}});
 }catch(e){return failure(e)}}
