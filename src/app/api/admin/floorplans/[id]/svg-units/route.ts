import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {svgProblems} from "@/lib/svg-safety";
import {parseSvgUnits} from "@/lib/floorplan-svg-import";
import {areaFrom, dimensionLabelOf} from "@/lib/floorplan-geometry";

const schema = z.object({svg: z.string().min(10).max(5_000_000), unitsPerMetre: z.number().positive().max(10000), dryRun: z.boolean().default(true),
  defaultCategory: z.string().min(1).max(60).default("Standard"), rowVersion: z.number().int()}).strict();

/** FR-113 (P2): create/update DRAFT booth units from SVG element IDs. Dry run first; existing codes keep their
 * category unless the SVG sets data-category. Units only ever land in a draft and go live via the normal publish. */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params; z.string().uuid().parse(id);
    const x = schema.parse(await req.json());
    const bad = svgProblems(x.svg);
    if (bad.length) throw new HttpError(400, "UNSAFE_SVG", "SVG rejected: " + bad.join(", "));
    const plan = await db.floorplan.findUnique({where: {id}, include: {units: {select: {id: true, code: true}}}});
    if (!plan) throw new HttpError(404, "NOT_FOUND", "Floorplan missing.");
    if (plan.status !== "DRAFT") throw new HttpError(409, "NOT_DRAFT", "Import only into a draft.");
    const {units, warnings} = parseSvgUnits(x.svg, {canvasWidth: plan.canvasWidth, canvasHeight: plan.canvasHeight, unitsPerMetre: x.unitsPerMetre});
    const existing = new Map(plan.units.map(u => [u.code.toUpperCase(), u.id]));
    const preview = units.map(u => ({...u, action: existing.has(u.code) ? "UPDATE" : "CREATE"}));
    if (x.dryRun || !units.length) return NextResponse.json({dryRun: true, units: preview, warnings}, {headers: {"Cache-Control": "private,no-store"}});
    const out = await db.$transaction(async tx => {
      const fresh = await tx.floorplan.findUniqueOrThrow({where: {id}});
      if (fresh.rowVersion !== x.rowVersion || fresh.status !== "DRAFT") throw new HttpError(409, "VERSION_CONFLICT", "Floorplan changed; reload before importing.");
      const cats = new Map((await tx.boothCategory.findMany({where: {eventId: plan.eventId}})).map(c => [c.name.toLowerCase(), c]));
      let created = 0, updated = 0;
      for (const u of units) {
        const cat = u.category ? cats.get(u.category.toLowerCase()) : undefined;
        const geom = {x: u.x, y: u.y, w: u.w, h: u.h, rotation: 0, placed: true, lengthM: u.lengthM, widthM: u.widthM, areaSqm: areaFrom(u.lengthM, u.widthM), dimensionLabel: dimensionLabelOf(u.lengthM, u.widthM), ...(u.hall ? {hall: u.hall} : {})};
        const eid = existing.get(u.code);
        if (eid) { await tx.boothUnit.update({where: {id: eid}, data: {...geom, ...(u.category ? {category: cat?.name ?? u.category, categoryId: cat?.id ?? null} : {})}}); updated++; }
        else { const name = u.category || x.defaultCategory, c = cats.get(name.toLowerCase()); await tx.boothUnit.create({data: {floorplanId: id, code: u.code, category: c?.name ?? name, categoryId: c?.id ?? null, ...geom}}); created++; }
      }
      await tx.floorplan.update({where: {id}, data: {rowVersion: {increment: 1}}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "FLOORPLAN_SVG_UNITS_IMPORTED", resourceType: "Floorplan", resourceId: id, afterState: {created, updated, warnings: warnings.length, unitsPerMetre: x.unitsPerMetre}}});
      return {created, updated, rowVersion: fresh.rowVersion + 1};
    }, {isolationLevel: "Serializable"});
    return NextResponse.json({dryRun: false, ...out, warnings}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
