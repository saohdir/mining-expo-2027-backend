import {NextRequest, NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";

/** FR-120 customer accounts registry with search + pagination (role-scoped columns). */
export async function GET(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN", "SALES", "FINANCE", "OPERATIONS"]);
    const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
    const page = Math.max(1, Math.min(10000, Number(req.nextUrl.searchParams.get("page")) || 1));
    const where = q ? {OR: [{id: {startsWith: q}}, {email: {contains: q, mode: "insensitive" as const}}, {profile: {fullName: {contains: q, mode: "insensitive" as const}}}, {profile: {organization: {contains: q, mode: "insensitive" as const}}}]} : {};
    const [total, rows] = await Promise.all([db.customerAccount.count({where}), db.customerAccount.findMany({where, orderBy: {createdAt: "desc"}, take: 30, skip: (page - 1) * 30,
      select: {id: true, email: true, phone: true, status: true, createdAt: true, verifiedEmailAt: true, profile: {select: {fullName: true, organization: true}},
        _count: {select: {enrollments: true, requests: true, invoices: true}}}})]);
    return NextResponse.json({total, page, limit: 30, customers: rows.map(r => ({...r, phone: ["SUPER_ADMIN", "SALES", "FINANCE"].includes(actor.role) ? r.phone : null}))}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
