import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";

// Backwards-compatible single-record PATCH plus one atomic batch operation.
// All supplied IDs remain constrained to the actor's notification audience.
const patch=z.union([
  z.object({id:z.string().uuid()}).strict(),
  z.object({ids:z.array(z.string().uuid()).min(1).max(100)}).strict()
]);
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
    const body=patch.parse(await req.json());
    const ids="id" in body?[body.id]:body.ids;
    const result=await db.notification.updateMany({
      where:{id:{in:ids},...scope(actor.role),readAt:null},data:{readAt:new Date()}
    });
    return NextResponse.json({updated:result.count},{headers:{"Cache-Control":"private,no-store"}});
  }catch(e){return failure(e)}
}
