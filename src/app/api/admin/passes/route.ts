import {NextRequest, NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
/** Pass lookup for QR administration (FR-137). Never returns tokens. */
export async function GET(req: NextRequest) {
  try {
    await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 120);
    if (q.length < 3) throw new HttpError(400, "QUERY_TOO_SHORT", "Search by email, name or enrollment id (min 3 chars).");
    const passes = await db.eventPass.findMany({where: {OR: [{enrollmentId: {startsWith: q}}, {account: {email: {contains: q, mode: "insensitive"}}}, {account: {profile: {fullName: {contains: q, mode: "insensitive"}}}}]},
      take: 30, orderBy: {issuedAt: "desc"},
      select: {id: true, status: true, entitlement: true, issuedAt: true, expiresAt: true, revokedAt: true, revokeReason: true, replacedById: true, enrollmentId: true,
        enrollment: {select: {type: true, status: true}}, account: {select: {email: true, profile: {select: {fullName: true}}}}, _count: {select: {admissions: true}}}});
    return NextResponse.json({passes}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
