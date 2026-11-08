import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";

const patch=z.object({id:z.string().uuid()}).strict();
const scope=(role:string)=>role==="SUPER_ADMIN"?{}:{audienceRole:role as "SALES"|"FINANCE"|"OPERATIONS"|"CONTENT_EDITOR"|"CHECKIN_STAFF"|"VIEWER"};
export async function GET(){
  try{
    const actor=await admin();
    const notes=await db.notification.findMany({
      where:scope(actor.role),take:100,orderBy:{createdAt:"desc"}
    });
    return NextResponse.json({notifications:notes},{headers:{"Cache-Control":"private,no-store"}});
  }catch(e){return failure(e)}
}
export async function PATCH(req:NextRequest){
  try{
    const actor=await admin();
    const {id}=patch.parse(await req.json());
    const result=await db.notification.updateMany({
      where:{id,...scope(actor.role)},data:{readAt:new Date()}
    });
    return NextResponse.json({updated:result.count},{headers:{"Cache-Control":"private,no-store"}});
  }catch(e){return failure(e)}
}
