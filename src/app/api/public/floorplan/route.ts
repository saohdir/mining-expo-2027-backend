import {NextRequest, NextResponse} from "next/server";
import {activeEventCode} from "@/lib/active-event";
import {db} from "@/lib/db";
import {failure} from "@/lib/errors";
import {publicDisplay} from "@/lib/floorplan-public";

/** Public, PII-free published map (FR-015/103/105/107/108, NFR-22). Cached ≤60 s.
 * Several floors can be live; only ACTIVE ones are listed in `floors`, `?floor=<id>` selects one (default: the first).
 * Booked booths (owner setting "Public floor plan display"): "names" shows RESERVED/OCCUPIED with the company — the
 * exhibitor's consented public name, or the company an admin entered — and "status" reports every booked or blocked booth
 * only as UNAVAILABLE without names. Available booths carry their category colour. */
export async function GET(req: NextRequest) {
  try {
    const eventCode = req.nextUrl.searchParams.get("event") || activeEventCode();
    const cache = {"Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=30"};
    const live = await db.floorplan.findMany({where: {event: {code: eventCode, published: true}, status: "PUBLISHED", active: true}, orderBy: [{publishedAt: "asc"}, {versionNo: "asc"}], select: {id: true, title: true, versionNo: true}});
    const wanted = req.nextUrl.searchParams.get("floor");
    const pick = live.find(f => f.id === wanted) || live[0];
    const plan = !pick ? null : await db.floorplan.findFirst({where: {id: pick.id},
      include: {units: {where: {placed: true}, orderBy: {code: "asc"}, select: {id: true, code: true, category: true, hall: true, zone: true, x: true, y: true, w: true, h: true, rotation: true,
        areaSqm: true, lengthM: true, widthM: true, dimensionLabel: true, status: true, approvedPublicName: true, occupantCompany: true,
        boothCategory: {select: {name: true, colorHex: true, pattern: true}}, assignments: {where: {active: true, approvedForPublic: true}, select: {id: true}}}}}});
    if (!plan) return NextResponse.json({state: "COMING_SOON", units: []}, {headers: cache});
    const categories = await db.boothCategory.findMany({where: {eventId: plan.eventId}, orderBy: [{sortOrder: "asc"}, {name: "asc"}], select: {name: true, colorHex: true, pattern: true}});
    const display = await publicDisplay();
    return NextResponse.json({state: "PUBLISHED", id: plan.id, version: plan.versionNo, title: plan.title, floors: live.map(f => ({id: f.id, title: f.title, version: f.versionNo})), backgroundUrl: plan.backgroundUrl, backgroundAlt: plan.backgroundAlt,
      canvas: {width: plan.canvasWidth, height: plan.canvasHeight}, categories, display,
      units: plan.units.map(({assignments, boothCategory, occupantCompany, approvedPublicName, ...u}) => {
        const booked = u.status === "RESERVED" || u.status === "OCCUPIED";
        const name = display === "names" && booked ? (assignments.length ? approvedPublicName : null) || occupantCompany || null : null;
        return {...u, status: display === "status" && u.status !== "AVAILABLE" ? "UNAVAILABLE" : u.status,
          areaSqm: u.areaSqm.toString(), lengthM: u.lengthM?.toString() ?? null, widthM: u.widthM?.toString() ?? null,
          categoryName: boothCategory?.name ?? u.category, categoryColor: boothCategory?.colorHex ?? null, categoryPattern: boothCategory?.pattern ?? null, approvedPublicName: name};
      })}, {headers: cache});
  } catch (e) { return failure(e); }
}
