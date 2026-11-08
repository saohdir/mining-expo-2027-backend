import {NextRequest,NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {financeTotals} from "@/lib/policy";
import {customerPaymentState} from "@/lib/finance-ledger";
import {failure,HttpError} from "@/lib/errors";

const statuses=["DRAFT","ISSUED","SENT","PARTIALLY_PAID","PAID","OVERDUE","VOID","CANCELLED"] as const;
export async function GET(req:NextRequest){
 try{
  await admin(["SUPER_ADMIN","FINANCE","SALES"]);
  const params=req.nextUrl.searchParams;
  const status=params.get("status")||"";
  if(status&&!statuses.includes(status as typeof statuses[number]))throw new HttpError(400,"BAD_STATUS","Unsupported invoice status.");
  const pageRaw=Number(params.get("page")||1),page=Number.isInteger(pageRaw)&&pageRaw>0?Math.min(pageRaw,10000):1;
  const q=params.get("q")?.trim().slice(0,100);
  const where={
    ...(status?{status:status as typeof statuses[number]}:{}),
    ...(q?{OR:[{number:{contains:q,mode:"insensitive" as const}},{account:{email:{contains:q,mode:"insensitive" as const}}},{account:{profile:{fullName:{contains:q,mode:"insensitive" as const}}}}]}:{})
  };
  const [total,records]=await Promise.all([
   db.invoice.count({where}),
   db.invoice.findMany({where,take:30,skip:(page-1)*30,orderBy:{createdAt:"desc"},include:{
    account:{select:{email:true,profile:{select:{fullName:true,organization:true}}}},
    transfers:{select:{status:true,amountMinor:true}},
    adjustments:{select:{type:true,amountMinor:true}},
    enrollment:{select:{type:true,conference:{select:{title:true}}}},
    boothRequest:{select:{requestedAreaSqm:true}}
   }})
  ]);
  return NextResponse.json({total,page,limit:30,records:records.map(item=>{
   const totals=financeTotals(item.totalMinor,item.transfers,item.adjustments.filter(r=>r.type==="REVERSAL").map(r=>r.amountMinor));const summary=customerPaymentState(item,item.transfers,item.adjustments);
   return {id:item.id,number:item.number,status:item.status,createdAt:item.createdAt,issuedAt:item.issuedAt,dueAt:item.dueAt,
    customerName:item.account.profile?.fullName||item.account.email||"Customer",organization:item.account.profile?.organization||null,email:item.account.email,
    bookingType:item.enrollment?item.enrollment.type:item.boothRequest?"EXHIBITOR":"OTHER",
    bookingLabel:item.enrollment?.conference?.title|| (item.boothRequest?"Exhibitor booth request":""),
    totalMinor:item.totalMinor.toString(),minimumDpMinor:item.minimumDpMinor.toString(),paidMinor:totals.paidMinor,
    outstandingMinor:totals.outstandingMinor,verifiedReceiptCount:item.transfers.filter(t=>t.status==="VERIFIED").length,
    paymentStatus:summary.state,overdue:summary.overdue,pendingProofs:summary.pendingProofs
   };
  })},{headers:{"Cache-Control":"private,no-store"}});
 }catch(e){return failure(e)}
}
