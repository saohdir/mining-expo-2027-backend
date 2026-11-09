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
    // Optional (additive) list controls: status filter, sort and page size. Defaults keep the original behaviour.
    const status = req.nextUrl.searchParams.get("status") || "";
    const statuses = ["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "CLOSED"] as const;
    const limit = [10, 25, 30, 50, 100].includes(Number(req.nextUrl.searchParams.get("pageSize"))) ? Number(req.nextUrl.searchParams.get("pageSize")) : 30;
    const [sortKey, sortDir] = (req.nextUrl.searchParams.get("sort") || "created:desc").split(":");
    const dir = sortDir === "asc" ? "asc" as const : "desc" as const;
    const orderBy = sortKey === "name" ? [{profile: {fullName: dir}}, {createdAt: "desc" as const}] : sortKey === "email" ? [{email: dir}] : sortKey === "status" ? [{status: dir}, {createdAt: "desc" as const}] : [{createdAt: dir}];
    const where = {
      ...(q ? {OR: [{id: {startsWith: q}}, {email: {contains: q, mode: "insensitive" as const}}, {profile: {fullName: {contains: q, mode: "insensitive" as const}}}, {profile: {organization: {contains: q, mode: "insensitive" as const}}}]} : {}),
      ...((statuses as readonly string[]).includes(status) ? {status: status as typeof statuses[number]} : {})
    };
    const [total, rows] = await Promise.all([db.customerAccount.count({where}), db.customerAccount.findMany({where, orderBy, take: limit, skip: (page - 1) * limit,
      select: {id: true, email: true, phone: true, status: true, createdAt: true, verifiedEmailAt: true, profile: {select: {fullName: true, organization: true}},
        _count: {select: {enrollments: true, requests: true, invoices: true}}}})]);
    return NextResponse.json({total, page, limit, customers: rows.map(r => ({...r, phone: ["SUPER_ADMIN", "SALES", "FINANCE"].includes(actor.role) ? r.phone : null}))}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
