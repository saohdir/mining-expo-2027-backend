import { NextResponse } from "next/server";import { endSessions } from "@/lib/auth";
export async function POST(){await endSessions("customer");return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}})}
