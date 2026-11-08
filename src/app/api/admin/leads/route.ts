import {NextRequest, NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";
/** FR-036 lead inbox (SUPER_ADMIN/SALES; Operations read for exhibitor logistics). */
export async function GET(req: NextRequest) {
  try {
    await admin(["SUPER_ADMIN", "SALES", "OPERATIONS"]);
    const status = req.nextUrl.searchParams.get("status") || undefined, q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 100);
    const leads = await db.lead.findMany({where: {...(status ? {status} : {}), ...(q ? {OR: [{email: {contains: q, mode: "insensitive"}}, {name: {contains: q, mode: "insensitive"}}, {company: {contains: q, mode: "insensitive"}}]} : {})},
      orderBy: {createdAt: "desc"}, take: 100, select: {id: true, leadType: true, name: true, email: true, company: true, phone: true, message: true, status: true, utmSource: true, utmMedium: true, utmCampaign: true, createdAt: true, updatedAt: true}});
    return NextResponse.json({leads}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
