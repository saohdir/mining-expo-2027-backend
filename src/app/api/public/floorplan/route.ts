import {NextRequest, NextResponse} from "next/server";
import {activeEventCode} from "@/lib/active-event";
import {db} from "@/lib/db";
import {failure} from "@/lib/errors";

/** Public, PII-free published map (FR-015/103/105/107/108, NFR-22). Cached ≤60 s.
 * Company names appear only for OCCUPIED units whose assignment is approved for public display. */
export async function GET(req: NextRequest) {
  try {
    const eventCode = req.nextUrl.searchParams.get("event") || activeEventCode();
    const cache = {"Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=30"};
    const plan = await db.floorplan.findFirst({where: {event: {code: eventCode, published: true}, status: "PUBLISHED"},
      include: {units: {where: {placed: true}, orderBy: {code: "asc"}, select: {id: true, code: true, category: true, hall: true, zone: true, x: true, y: true, w: true, h: true, rotation: true,
        areaSqm: true, lengthM: true, widthM: true, dimensionLabel: true, status: true, approvedPublicName: true,
        boothCategory: {select: {name: true, colorHex: true, pattern: true}}, assignments: {where: {active: true, approvedForPublic: true}, select: {id: true}}}}}});
    if (!plan) return NextResponse.json({state: "COMING_SOON", units: []}, {headers: cache});
    const categories = await db.boothCategory.findMany({where: {eventId: plan.eventId}, orderBy: [{sortOrder: "asc"}, {name: "asc"}], select: {name: true, colorHex: true, pattern: true}});
    return NextResponse.json({state: "PUBLISHED", id: plan.id, version: plan.versionNo, title: plan.title, backgroundUrl: plan.backgroundUrl, backgroundAlt: plan.backgroundAlt,
      canvas: {width: plan.canvasWidth, height: plan.canvasHeight}, categories,
      units: plan.units.map(({assignments, boothCategory, ...u}) => ({...u, areaSqm: u.areaSqm.toString(), lengthM: u.lengthM?.toString() ?? null, widthM: u.widthM?.toString() ?? null,
        categoryColor: boothCategory?.colorHex ?? null, categoryPattern: boothCategory?.pattern ?? null,
        approvedPublicName: u.status === "OCCUPIED" && assignments.length ? u.approvedPublicName : null}))}, {headers: cache});
  } catch (e) { return failure(e); }
}
