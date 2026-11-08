import {NextRequest,NextResponse} from "next/server";import {readFile} from "node:fs/promises";import path from "node:path";
export const runtime="nodejs";
export async function GET(_req:NextRequest,{params}:{params:Promise<{key:string}>}){const {key}=await params;
if(!/^[0-9a-f-]{36}\.webp$/i.test(key))return new NextResponse("Not found",{status:404});
const dir=process.env.FLOORPLAN_UPLOAD_DIR||path.resolve(".data/floorplans");try{const bytes=await readFile(path.join(dir,key));return new NextResponse(new Uint8Array(bytes),{headers:{"Content-Type":"image/webp","Cache-Control":"public,max-age=86400","X-Content-Type-Options":"nosniff"}})}catch{return new NextResponse("Not found",{status:404})}
}
