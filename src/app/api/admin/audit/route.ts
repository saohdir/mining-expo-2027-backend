import {NextRequest,NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure,HttpError} from "@/lib/errors";
import {Prisma} from "@prisma/client";

export async function GET(req:NextRequest){
  try{
    await admin(["SUPER_ADMIN"]);
    const p=req.nextUrl.searchParams;
    const page=Math.min(1000,Math.max(1,Number(p.get("page")||"1")||1));
    const action=p.get("action")?.trim().slice(0,100)||"";
    const resourceType=p.get("resourceType")?.trim().slice(0,100)||"";
    const where:Prisma.AuditLogWhereInput={
      ...(action?{action:{contains:action,mode:"insensitive"}}:{}),
      ...(resourceType?{resourceType:{contains:resourceType,mode:"insensitive"}}:{})
    };
    const [total,records]=await Promise.all([
      db.auditLog.count({where}),
      db.auditLog.findMany({where,orderBy:{createdAt:"desc"},skip:(page-1)*30,take:30,
        select:{id:true,adminId:true,accountId:true,action:true,resourceType:true,resourceId:true,createdAt:true,beforeState:true,afterState:true}})
    ]);
    return NextResponse.json({total,page,limit:30,records},{headers:{"Cache-Control":"private,no-store"}});
  }catch(e){return failure(e)}
}
