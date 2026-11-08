import {NextRequest, NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";
import {expireStale, staffLimit} from "@/lib/invitations";

/** FR-156: booth representatives per exhibitor booking (support/ops view). */
export async function GET(req: NextRequest) {
  try {
    await admin(["SUPER_ADMIN", "OPERATIONS", "SALES", "VIEWER"]);
    await expireStale();
    const boothRequestId = req.nextUrl.searchParams.get("boothRequestId") || undefined;
    const rows = await db.invitation.findMany({where: {kind: "EXHIBITOR_STAFF", boothRequestId}, orderBy: {createdAt: "desc"}, take: 2000,
      select: {id: true, boothRequestId: true, email: true, fullName: true, status: true, createdAt: true, respondedAt: true, expiresAt: true}});
    return NextResponse.json({limit: staffLimit(), staff: rows}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
