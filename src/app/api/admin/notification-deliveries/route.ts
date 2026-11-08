import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";

export async function GET(){
  try{
    await admin(["SUPER_ADMIN","OPERATIONS"]);
    const records=await db.notificationOutbox.findMany({
      orderBy:{createdAt:"desc"},take:100,
      select:{id:true,topic:true,state:true,attempts:true,createdAt:true,nextRunAt:true}
    });
    return NextResponse.json({records},{headers:{"Cache-Control":"private,no-store"}});
  }catch(e){return failure(e)}
}
