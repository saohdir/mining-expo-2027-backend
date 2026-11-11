import {NextRequest,NextResponse} from "next/server";
import {db} from "@/lib/db";import {admin} from "@/lib/auth";import {failure,HttpError} from "@/lib/errors";
import {mkdir,writeFile} from "node:fs/promises";import path from "node:path";import {randomUUID} from "node:crypto";import sharp from "sharp";import {svgProblems} from "@/lib/svg-safety";
export const runtime="nodejs";const MAX_BYTES=15*1024*1024;
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{
const actor=await admin(["SUPER_ADMIN","OPERATIONS"]);const {id}=await params;
const plan=await db.floorplan.findUnique({where:{id}});if(!plan||plan.status==="ARCHIVED")throw new HttpError(409,"NOT_EDITABLE","Upload is not possible for an archived version.");
const fd=await req.formData(),file=fd.get("file");
if(!(file instanceof File)||file.size===0||file.size>MAX_BYTES)throw new HttpError(400,"BAD_FILE","Please upload an image not exceeding 15 MB.");
if(file.type==="application/pdf"||/\.pdf$/i.test(file.name))throw new HttpError(415,"PDF_NOT_SUPPORTED","PDF is not accepted. Convert the floorplan page to PNG, JPG, WebP or SVG first.");
if(!["image/png","image/jpeg","image/webp","image/svg+xml"].includes(file.type))throw new HttpError(415,"BAD_MIME","PNG, JPG, WebP or sanitized SVG accepted.");
let raw:Buffer=Buffer.from(await file.arrayBuffer());
if(file.type==="image/svg+xml"){const problems=svgProblems(raw.toString("utf8"));if(problems.length)throw new HttpError(415,"UNSAFE_SVG","SVG rejected: "+problems.join(", ")+".");
 try{raw=await sharp(raw,{density:144,limitInputPixels:64e6}).png().toBuffer()}catch{throw new HttpError(400,"INVALID_IMAGE","SVG could not be rendered.");}}let meta:sharp.Metadata;
try{meta=await sharp(raw,{failOn:"error",limitInputPixels:64e6}).metadata()}catch{throw new HttpError(400,"INVALID_IMAGE","Image could not be decoded.");}
if(!["png","jpeg","webp"].includes(meta.format||"")||!meta.width||!meta.height||meta.width>8000||meta.height>8000)throw new HttpError(400,"IMAGE_LIMIT","Invalid image format or dimensions.");
const key=randomUUID()+".webp";const dir=process.env.FLOORPLAN_UPLOAD_DIR||path.resolve(".data/floorplans");
await mkdir(dir,{recursive:true});
// A header can parse while the pixel data is corrupt: treat decode failures as client errors, not 500s.
let optimized:Buffer;try{optimized=await sharp(raw,{failOn:"error",limitInputPixels:64e6}).rotate().resize({width:4000,height:4000,fit:"inside",withoutEnlargement:true}).webp({quality:85}).toBuffer()}catch{throw new HttpError(400,"INVALID_IMAGE","Image could not be decoded.");}await writeFile(path.join(dir,key),optimized,{flag:"wx",mode:0o640});
await db.auditLog.create({data:{adminId:actor.id,action:"FLOORPLAN_IMAGE_UPLOADED",resourceType:"Floorplan",resourceId:id,afterState:{key,width:meta.width,height:meta.height,bytes:optimized.byteLength}}});
return NextResponse.json({url:"/api/public/floorplan-media/"+key,bytes:optimized.byteLength},{status:201,headers:{"Cache-Control":"private,no-store"}});
}catch(e){return failure(e)}}
