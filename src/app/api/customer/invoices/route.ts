import {NextResponse} from "next/server";
import {db} from "@/lib/db";import {customer} from "@/lib/auth";import {financeTotals,bankDetails} from "@/lib/policy";import {failure} from "@/lib/errors";
export async function GET(){try{const acc=await customer();
 const records=await db.invoice.findMany({where:{accountId:acc.id,status:{not:"DRAFT"}},include:{items:true,transfers:{select:{amountMinor:true,status:true,verifiedAt:true}}},orderBy:{createdAt:"desc"}});
 const bank=records.some(x=>["ISSUED","SENT","PARTIALLY_PAID","PAID","OVERDUE"].includes(x.status))?bankDetails():null;
 return NextResponse.json({invoices:records.map(r=>{const totals=financeTotals(r.totalMinor,r.transfers);return {
 id:r.id,number:r.number,status:r.status,issuedAt:r.issuedAt,dueAt:r.dueAt,totalMinor:r.totalMinor.toString(),minimumDpMinor:r.minimumDpMinor.toString(),
 items:r.items.map(i=>({description:i.description,quantity:i.quantity,unitPriceMinor:i.unitPriceMinor.toString(),amountMinor:i.amountMinor.toString()})),
 ...totals,state:["CANCELLED","VOID"].includes(r.status)?"CANCELLED":totals.state,
 bankDetails:["ISSUED","SENT","PARTIALLY_PAID","PAID","OVERDUE"].includes(r.status)?bank:null
 }} )},{headers:{"Cache-Control":"private,no-store"}})}catch(e){return failure(e)}}
