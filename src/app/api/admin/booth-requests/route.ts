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
    const where = state && allowed.includes(state as typeof allowed[number])
      ? {status: state as typeof allowed[number]} : {};
    const records = await db.boothRequest.findMany({
      where, take: 100, orderBy: {createdAt: "desc"},
      include: {
        account: {select: {email: true, phone: true, profile: {select: {fullName: true, organization: true}}}},
        floorplan: {
          select: {status: true, versionNo: true, title: true,
            units: {select: {id: true, code: true, hall: true, areaSqm: true, status: true}}}
        },
        offers: {orderBy: {revision: "desc"}, take: 1,
          select: {id: true, revision: true, offeredUnits: true, offeredUnitIds: true,
            offeredAreaSqm: true, quotedPriceMinor: true, acceptedAt: true,
            createdAt: true, expiresAt: true}},
        assignments: {where: {active: true}, include: {boothUnit: {select: {code: true, hall: true}}}}
      }
    });
    return NextResponse.json({
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
