import {NextRequest, NextResponse} from "next/server";
import {activeEventCode} from "@/lib/active-event";
import {db} from "@/lib/db";
import {failure} from "@/lib/errors";

/** FR-014 / FR-110 exhibitor directory: only assignments approved for public display on the PUBLISHED
 * floorplan; booth numbers come from active assignments (single source of truth). No contact/PII. */
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase().slice(0, 80), category = req.nextUrl.searchParams.get("category") || "";
    const plan = await db.floorplan.findFirst({where: {status: "PUBLISHED", event: {code: req.nextUrl.searchParams.get("event") || activeEventCode(), published: true}}, select: {id: true}});
    if (!plan) return NextResponse.json({exhibitors: [], categories: []}, {headers: {"Cache-Control": "public, max-age=30, s-maxage=60"}});
    const rows = await db.boothAssignment.findMany({where: {active: true, approvedForPublic: true, boothUnit: {floorplanId: plan.id}},
      select: {boothRequestId: true, boothUnit: {select: {code: true, hall: true, category: true, approvedPublicName: true}}}});
    const byRequest = new Map<string, {name: string; booths: string[]; halls: Set<string>; categories: Set<string>}>();
    for (const r of rows) {
      const name = r.boothUnit.approvedPublicName?.trim(); if (!name) continue;
      const e = byRequest.get(r.boothRequestId) ?? {name, booths: [], halls: new Set<string>(), categories: new Set<string>()};
      e.booths.push(r.boothUnit.code); if (r.boothUnit.hall) e.halls.add(r.boothUnit.hall); e.categories.add(r.boothUnit.category);
      byRequest.set(r.boothRequestId, e);
    }
    const all = [...byRequest.values()].map(e => ({name: e.name, boothNo: e.booths.sort().join(", "), halls: [...e.halls], categories: [...e.categories]}));
    const exhibitors = all.filter(e => (!q || e.name.toLowerCase().includes(q) || e.boothNo.toLowerCase().includes(q)) && (!category || e.categories.includes(category)))
      .sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({exhibitors, categories: [...new Set(all.flatMap(e => e.categories))].sort()}, {headers: {"Cache-Control": "public, max-age=30, s-maxage=60"}});
  } catch (e) { return failure(e); }
}
