import { NextResponse } from "next/server";
import { ZodError } from "zod";
export class HttpError extends Error { constructor(public status:number, public code:string, message:string){super(message);} }
export function failure(error:unknown){
 if(error instanceof HttpError) return NextResponse.json({error:error.code,message:error.message},{status:error.status,headers:{"Cache-Control":"no-store"}});
 if(error instanceof ZodError) return NextResponse.json({error:"INVALID_INPUT",issues:error.issues.map(x=>({field:x.path.join("."),message:x.message}))},{status:400,headers:{"Cache-Control":"no-store"}});
 console.error("Request failed", error instanceof Error?error.message:"Unknown error");
 return NextResponse.json({error:"INTERNAL_ERROR",message:"Request could not be completed."},{status:500,headers:{"Cache-Control":"no-store"}});
}
export function safe<T>(fn:()=>Promise<T>):Promise<T|NextResponse>{return fn().catch(failure);}
