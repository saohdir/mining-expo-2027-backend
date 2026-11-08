import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {floorplanStats} from "@/lib/floorplan-geometry";
import {safeCell} from "@/lib/policy";

/** FR-111: units per status/category, occupied m² and %, CSV export by authorized roles. */
export async function GET(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS", "SALES", "FINANCE", "VIEWER"]);
    const {id} = await params; z.string().uuid().parse(id);
    const plan = await db.floorplan.findUnique({where: {id}, include: {units: {where: {placed: true}, select: {status: true, category: true, areaSqm: true}}}});
    if (!plan) throw new HttpError(404, "NOT_FOUND", "Floorplan missing.");
    const stats = floorplanStats(plan.units.map(u => ({...u, areaSqm: Number(u.areaSqm)})));
    if (req.nextUrl.searchParams.get("format") === "csv") {
      if (actor.role === "VIEWER") throw new HttpError(403, "FORBIDDEN", "Export not permitted.");
      const rows = [["dimension", "key", "units", "areaSqm"], ...Object.entries(stats.byStatus).map(([k, v]) => ["status", k, v.units, v.areaSqm]),
        ...Object.entries(stats.byCategory).map(([k, v]) => ["category", k, v.units, v.areaSqm]), ["total", "occupiedPercent", stats.totalUnits, stats.occupiedPercent]];
      await db.auditLog.create({data: {adminId: actor.id, action: "FLOORPLAN_STATS_EXPORTED", resourceType: "Floorplan", resourceId: id}});
      return new NextResponse(rows.map(r => r.map(v => '"' + safeCell(v).replace(/"/g, '""') + '"').join(",")).join("\r\n"), {headers: {"Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"floorplan-stats.csv\"", "Cache-Control": "private,no-store"}});
    }
    return NextResponse.json({versionNo: plan.versionNo, status: plan.status, ...stats}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
