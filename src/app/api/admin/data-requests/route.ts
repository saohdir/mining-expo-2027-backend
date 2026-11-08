import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";
export async function GET() {
  try { await admin(["SUPER_ADMIN"]); return NextResponse.json({requests: await db.dataRequest.findMany({orderBy: {createdAt: "desc"}, take: 100})}, {headers: {"Cache-Control": "private,no-store"}}); }
  catch (e) { return failure(e); }
}
