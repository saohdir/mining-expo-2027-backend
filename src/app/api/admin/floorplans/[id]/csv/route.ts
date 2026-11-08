import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {areaFrom, dimensionLabelOf, parseUnitsCsv, unitsToCsv} from "@/lib/floorplan-geometry";

/** FR-097 CSV export (formula-safe) of unit inventory. */
export async function GET(_req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS", "SALES", "FINANCE"]);
    const {id} = await params; z.string().uuid().parse(id);
    const plan = await db.floorplan.findUnique({where: {id}, include: {units: {orderBy: {code: "asc"}}}});
    if (!plan) throw new HttpError(404, "NOT_FOUND", "Floorplan missing.");
    await db.auditLog.create({data: {adminId: actor.id, action: "FLOORPLAN_CSV_EXPORTED", resourceType: "Floorplan", resourceId: id, afterState: {rows: plan.units.length}}});
    return new NextResponse(unitsToCsv(plan.units.map(u => ({...u, lengthM: u.lengthM?.toString(), widthM: u.widthM?.toString()}))), {headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="floorplan-v${plan.versionNo}-units.csv"`, "Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}

/** FR-097 CSV import into a DRAFT: existing codes get updated dimensions/category/hall;
 * new codes land in the Unplaced tray (placed=false) to be dragged onto the canvas. */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params; z.string().uuid().parse(id);
    const rowVersion = Number(req.nextUrl.searchParams.get("rowVersion"));
    const text = await req.text();
    if (text.length > 200_000) throw new HttpError(413, "CSV_TOO_LARGE", "CSV too large.");
    const parsed = parseUnitsCsv(text);
    if (parsed.errors.length) return NextResponse.json({error: "INVALID_CSV", message: "CSV has errors.", errors: parsed.errors}, {status: 400});
    const out = await db.$transaction(async tx => {
      const plan = await tx.floorplan.findUnique({where: {id}, include: {units: true}});
      if (!plan) throw new HttpError(404, "NOT_FOUND", "Floorplan missing.");
      if (plan.status !== "DRAFT") throw new HttpError(409, "NOT_DRAFT", "Import only into a draft.");
      if (plan.rowVersion !== rowVersion) throw new HttpError(409, "VERSION_CONFLICT", "Floorplan changed; reload before importing.");
      const cats = new Map((await tx.boothCategory.findMany({where: {eventId: plan.eventId}})).map(c => [c.name.toLowerCase(), c.id]));
      const existing = new Map(plan.units.map(u => [u.code.toUpperCase(), u]));
      let updated = 0, unplaced = 0;
      for (const u of parsed.units) {
        const data = {category: u.category, categoryId: cats.get(u.category.toLowerCase()) ?? null, hall: u.hall, lengthM: u.lengthM, widthM: u.widthM,
          areaSqm: areaFrom(u.lengthM, u.widthM), dimensionLabel: dimensionLabelOf(u.lengthM, u.widthM)};
        const found = existing.get(u.code.toUpperCase());
        if (found) { await tx.boothUnit.update({where: {id: found.id}, data}); updated++; }
        else { await tx.boothUnit.create({data: {floorplanId: id, code: u.code, ...data, x: 0, y: 0, w: Math.max(10, u.lengthM * 10), h: Math.max(10, u.widthM * 10), placed: false}}); unplaced++; }
      }
      await tx.floorplan.update({where: {id}, data: {rowVersion: {increment: 1}}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "FLOORPLAN_CSV_IMPORTED", resourceType: "Floorplan", resourceId: id, afterState: {updated, unplaced}}});
      return {updated, unplaced, rowVersion: plan.rowVersion + 1};
    }, {isolationLevel: "Serializable"});
    return NextResponse.json(out, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
