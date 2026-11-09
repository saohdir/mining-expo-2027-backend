import {NextRequest, NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";

const allowed = ["NEW", "UNDER_REVIEW", "OFFERED", "ACCEPTED", "WAITING_INVOICE",
  "INVOICED", "ALLOCATION_PENDING", "CONFIRMED", "CANCELLED", "REJECTED"] as const;
export async function GET(req: NextRequest) {
  try {
    await admin(["SUPER_ADMIN", "SALES", "OPERATIONS", "FINANCE"]);
    const state = req.nextUrl.searchParams.get("status");
    const targetId = req.nextUrl.searchParams.get("id");
    if (targetId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
      return NextResponse.json({message:"Invalid booth request reference."},
        {status:400,headers:{"Cache-Control":"private,no-store"}});
    }
    // Optional paged mode (additive): ?page=&pageSize=&q=&sort=created:asc|desc. Without ?page the original latest-100 list is returned.
    const sp = req.nextUrl.searchParams, paged = sp.has("page");
    const page = Math.max(1, Math.min(10000, Number(sp.get("page")) || 1));
    const pageSize = [10, 25, 50, 100].includes(Number(sp.get("pageSize"))) ? Number(sp.get("pageSize")) : 25;
    const q = (sp.get("q") || "").trim().slice(0, 100);
    const where = {
      ...(q ? {OR: [{id: {startsWith: q.toLowerCase()}}, {account: {email: {contains: q, mode: "insensitive" as const}}},
        {account: {profile: {fullName: {contains: q, mode: "insensitive" as const}}}}, {account: {profile: {organization: {contains: q, mode: "insensitive" as const}}}}]} : {}),
      ...(state && allowed.includes(state as typeof allowed[number])
        ? {status: state as typeof allowed[number]} : {}),
      ...(targetId ? {id: targetId} : {})
    };
    const total = paged ? await db.boothRequest.count({where}) : undefined;
    const records = await db.boothRequest.findMany({
      where, take: paged ? pageSize : 100, skip: paged ? (page - 1) * pageSize : 0,
      orderBy: {createdAt: sp.get("sort") === "created:asc" ? "asc" : "desc"},
      include: {
        account: {select: {email: true, phone: true, profile: {select: {fullName: true, organization: true}}}},
        floorplan: {
          select: {status: true, versionNo: true, title: true,
            units: {select: {id: true, code: true, hall: true, areaSqm: true, status: true}}}
        },
        invoices: {orderBy: {createdAt: "desc"}, take: 1, select: {id: true, status: true}},
        offers: {orderBy: {revision: "desc"}, take: 1,
          select: {id: true, revision: true, offeredUnits: true, offeredUnitIds: true,
            offeredAreaSqm: true, quotedPriceMinor: true, acceptedAt: true,
            createdAt: true, expiresAt: true}},
        assignments: {where: {active: true}, include: {boothUnit: {select: {code: true, hall: true}}}}
      }
    });
    return NextResponse.json({
      ...(paged ? {total, page, pageSize} : {}),
      records: records.map(r => ({
        ...r, requestedAreaSqm: String(r.requestedAreaSqm),
        offeredAreaSqm: r.offeredAreaSqm === null ? null : String(r.offeredAreaSqm),
        offers: r.offers.map(o => ({
          ...o,
          offeredAreaSqm: String(o.offeredAreaSqm),
          quotedPriceMinor: String(o.quotedPriceMinor)
        })),
        floorplan: {
          ...r.floorplan,
          units: r.floorplan.units.map(u => ({...u, areaSqm: String(u.areaSqm)}))
        }
      }))
    }, {headers: {"Cache-Control": "private,no-store"}});
  } catch (error) {
    return failure(error);
  }
}
