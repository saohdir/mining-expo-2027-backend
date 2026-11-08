import {NextRequest,NextResponse} from "next/server";
import {db} from "@/lib/db";import {admin} from "@/lib/auth";import {failure,HttpError} from "@/lib/errors";
import {mkdir,writeFile} from "node:fs/promises";import path from "node:path";import {randomUUID} from "node:crypto";import sharp from "sharp";
export const runtime="nodejs";const MAX_BYTES=15*1024*1024;
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{
const actor=await admin(["SUPER_ADMIN","OPERATIONS"]);const {id}=await params;
const plan=await db.floorplan.findUnique({where:{id}});if(!plan||plan.status!=="DRAFT")throw new HttpError(409,"NOT_DRAFT","Upload only permitted for draft plans.");
const fd=await req.formData(),file=fd.get("file");
if(!(file instanceof File)||file.size===0||file.size>MAX_BYTES)throw new HttpError(400,"BAD_FILE","Please upload an image not exceeding 15 MB.");
if(!["image/png","image/jpeg","image/webp"].includes(file.type))throw new HttpError(415,"BAD_MIME","PNG, JPG or WebP accepted. SVG is disabled until server-side sanitization is approved.");
const raw=Buffer.from(await file.arrayBuffer());let meta:sharp.Metadata;
try{meta=await sharp(raw,{failOn:"error",limitInputPixels:64e6}).metadata()}catch{throw new HttpError(400,"INVALID_IMAGE","Image could not be decoded.");}
if(!["png","jpeg","webp"].includes(meta.format||"")||!meta.width||!meta.height||meta.width>8000||meta.height>8000)throw new HttpError(400,"IMAGE_LIMIT","Invalid image format or dimensions.");
const key=randomUUID()+".webp";const dir=process.env.FLOORPLAN_UPLOAD_DIR||path.resolve(".data/floorplans");
await mkdir(dir,{recursive:true});const optimized=await sharp(raw).rotate().resize({width:4000,height:4000,fit:"inside",withoutEnlargement:true}).webp({quality:85}).toBuffer();await writeFile(path.join(dir,key),optimized,{flag:"wx",mode:0o640});
await db.auditLog.create({data:{adminId:actor.id,action:"FLOORPLAN_IMAGE_UPLOADED",resourceType:"Floorplan",resourceId:id,afterState:{key,width:meta.width,height:meta.height,bytes:optimized.byteLength}}});
return NextResponse.json({url:"/api/public/floorplan-media/"+key,bytes:optimized.byteLength},{status:201,headers:{"Cache-Control":"private,no-store"}});
}catch(e){return failure(e)}}
