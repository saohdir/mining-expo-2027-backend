import {NextRequest,NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure,HttpError} from "@/lib/errors";
import {Prisma} from "@prisma/client";

const types=["VISITOR","CONFERENCE","EXHIBITOR"] as const;
const statuses=["DRAFT","SUBMITTED","PENDING_REVIEW","CONFIRMED","REJECTED","CANCELLED"] as const;
function wibRange(params:URLSearchParams){
 const from=params.get("from"),to=params.get("to");
 const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s));
 if(from&&!valid(from)||to&&!valid(to))throw new HttpError(400,"INVALID_DATE","Use YYYY-MM-DD for WIB date filters.");
 if(from&&to&&from>to)throw new HttpError(400,"INVALID_DATE","From date must not exceed To date.");
 return { ...(from?{gte:new Date(from+"T00:00:00+07:00")}:{ }),
 ...(to?{lt:new Date(Date.parse(to+"T00:00:00+07:00")+86400000)}:{}) };
}
export async function GET(req:NextRequest){try{
 const actor=await admin(["SUPER_ADMIN","OPERATIONS","SALES","FINANCE"]);
 const p=req.nextUrl.searchParams;
 const type=p.get("type"),status=p.get("status");
 if(type&&!types.includes(type as typeof types[number]))throw new HttpError(400,"BAD_TYPE","Unsupported registration type.");
 if(status&&!statuses.includes(status as typeof statuses[number]))throw new HttpError(400,"BAD_STATUS","Unsupported status.");
 const limit=Math.min(100,Math.max(1,Number(p.get("limit")||"30")||30));
 const page=Math.min(100000,Math.max(1,Number(p.get("page")||"1")||1));
 const dateRange=wibRange(p);
 const search=p.get("q")?.trim().slice(0,120);
 const where:Prisma.EnrollmentWhereInput={
  ...(type?{type:type as typeof types[number]}:{}),
  ...(status?{status:status as typeof statuses[number]}:{}),
  ...((p.get("from")||p.get("to"))?{createdAt:dateRange}:{}),
  ...(search?{OR:[
   {id:{startsWith:search,mode:"insensitive"}},
   {account:{email:{contains:search,mode:"insensitive"}}},
   {account:{profile:{fullName:{contains:search,mode:"insensitive"}}}}
  ]}:{})
 };
 const [total,rows]=await Promise.all([db.enrollment.count({where}),db.enrollment.findMany({
 where,take:limit,skip:(page-1)*limit,orderBy:{createdAt:"desc"},
 include:{account:{select:{email:true,phone:true,profile:{select:{fullName:true,organization:true}}}},conference:{select:{title:true}}}
 })]);
 await db.auditLog.create({data:{adminId:actor.id,action:"REGISTRATION_LIST_VIEW",resourceType:"Report",resourceId:"registrations",afterState:{page,limit,filters:Object.fromEntries(p.entries())}}});
 return NextResponse.json({page,limit,total,rows:rows.map(x=>({id:x.id,type:x.type,status:x.status,createdAt:x.createdAt,confirmedAt:x.confirmedAt,
 accountId:x.accountId,customerName:x.account.profile?.fullName??"",email:x.account.email,phone:x.account.phone,organization:x.account.profile?.organization,
 conference:x.conference?.title??null}))},{headers:{"Cache-Control":"private,no-store"}});
 }catch(e){return failure(e)}}
