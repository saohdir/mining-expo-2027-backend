import {NextRequest,NextResponse} from "next/server";import {z} from "zod";import {db} from "@/lib/db";import {admin} from "@/lib/auth";import {failure,HttpError} from "@/lib/errors";
const patch=z.object({rowVersion:z.number().int().positive(),title:z.string().min(3).max(160).optional(),backgroundUrl:z.string().max(500).nullable().optional(),canvasWidth:z.number().int().min(300).max(10000).optional(),canvasHeight:z.number().int().min(300).max(10000).optional(),backgroundAlt:z.string().trim().min(3).max(200).nullable().optional(),backgroundRights:z.enum(["OWNED","LICENSED","ORGANIZER_PROVIDED","PENDING_APPROVAL"]).nullable().optional()}).strict();
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){try{await admin(["SUPER_ADMIN","OPERATIONS","SALES","FINANCE"]);const {id}=await params;const plan=await db.floorplan.findUnique({where:{id},include:{units:{orderBy:{code:"asc"},include:{boothCategory:{select:{id:true,name:true,colorHex:true,pattern:true}}}}}});if(!plan)throw new HttpError(404,"NOT_FOUND","Floorplan not found.");return NextResponse.json({plan},{headers:{"Cache-Control":"private,no-store"}})}catch(e){return failure(e)}}
export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{const actor=await admin(["SUPER_ADMIN","OPERATIONS"]);const {id}=await params;const x=patch.parse(await req.json());if(x.backgroundUrl&&!/^\/[A-Za-z0-9/_\-.]+$/.test(x.backgroundUrl))throw new HttpError(400,"BAD_IMAGE","Use an approved asset path.");const updated=await db.$transaction(async tx=>{const p=await tx.floorplan.findUnique({where:{id}});if(!p)throw new HttpError(404,"NOT_FOUND","Floorplan missing.");if(p.status==="ARCHIVED")throw new HttpError(409,"ARCHIVED","Archived versions are read-only.");if(p.rowVersion!==x.rowVersion)throw new HttpError(409,"VERSION_CONFLICT","Another admin updated this floorplan. Reload.");const {rowVersion,...changes}=x;const r=await tx.floorplan.update({where:{id},data:{...changes,rowVersion:{increment:1}}});await tx.auditLog.create({data:{adminId:actor.id,action:"FLOORPLAN_EDITED",resourceType:"Floorplan",resourceId:id,beforeState:{rowVersion:p.rowVersion},afterState:{rowVersion:r.rowVersion}}});return r});return NextResponse.json({plan:updated},{headers:{"Cache-Control":"private,no-store"}})}catch(e){return failure(e)}}
/** Delete a floorplan version (owner request, Nov 2026): drafts, inactive live floors and archived versions.
 * An active floor must be set inactive first. A floor that still has booking history (requests, holds, assignments) is
 * not destroyed: it is archived instead, so invoices, quotations and audit history keep pointing at real booths. */
export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{
  const actor=await admin(["SUPER_ADMIN","OPERATIONS"]);const {id}=await params;
  const body=await req.json().catch(()=>({}));const reason=typeof body?.reason==="string"?body.reason.trim().slice(0,500):"";
  const out=await db.$transaction(async tx=>{
    const p=await tx.floorplan.findUnique({where:{id},include:{_count:{select:{units:true,boothRequests:true}}}});
    if(!p)throw new HttpError(404,"NOT_FOUND","Floorplan missing.");
    if(p.status==="PUBLISHED"&&p.active)throw new HttpError(409,"FLOOR_ACTIVE","Set this floor inactive first; customers can still see an active floor.");
    const [assignments,holds]=await Promise.all([tx.boothAssignment.count({where:{boothUnit:{floorplanId:id}}}),tx.boothHold.count({where:{boothUnit:{floorplanId:id}}})]);
    const history=p._count.boothRequests+assignments+holds;
    if(history>0){
      if(p.status==="ARCHIVED")throw new HttpError(409,"HAS_HISTORY",`This version still holds booking history (${p._count.boothRequests} request(s), ${assignments} assignment(s), ${holds} hold(s)) and is kept for invoices and audit.`);
      await tx.floorplan.update({where:{id},data:{status:"ARCHIVED",active:false,rowVersion:{increment:1}}});
      await tx.auditLog.create({data:{adminId:actor.id,action:"FLOORPLAN_REMOVED_ARCHIVED",resourceType:"Floorplan",resourceId:id,beforeState:{status:p.status,active:p.active},afterState:{status:"ARCHIVED",reason,requests:p._count.boothRequests,assignments,holds}}});
      return {id,result:"archived" as const,requests:p._count.boothRequests,assignments,holds};
    }
    await tx.floorplan.updateMany({where:{replacesId:id},data:{replacesId:null}});
    await tx.boothUnit.deleteMany({where:{floorplanId:id}});
    await tx.floorplan.delete({where:{id}});
    await tx.auditLog.create({data:{adminId:actor.id,action:"FLOORPLAN_DELETED",resourceType:"Floorplan",resourceId:id,beforeState:{title:p.title,versionNo:p.versionNo,status:p.status,units:p._count.units},afterState:{reason}}});
    return {id,result:"deleted" as const};
  },{isolationLevel:"Serializable"});
  return NextResponse.json(out,{headers:{"Cache-Control":"private,no-store"}});
}catch(e){return failure(e)}}
