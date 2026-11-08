import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";
/** Minimal staff directory for assignments (no password data). */
export async function GET() {
  try {
    await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const staff = await db.adminUser.findMany({where: {active: true}, select: {id: true, email: true, role: true}, orderBy: {email: "asc"}});
    return NextResponse.json({staff}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
