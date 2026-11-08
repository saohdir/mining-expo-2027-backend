import {NextResponse} from "next/server";import {admin} from "@/lib/auth";import {failure} from "@/lib/errors";
export async function GET(){try{const actor=await admin();return NextResponse.json({id:actor.id,email:actor.email,role:actor.role},{headers:{"Cache-Control":"private,no-store"}})}catch(e){return failure(e)}}
