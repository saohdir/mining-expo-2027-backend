import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {areaFrom, dimensionLabelOf, outOfCanvas, overlapWarnings} from "@/lib/floorplan-geometry";

const unit = z.object({
  code: z.string().min(1).max(25).regex(/^[A-Za-z0-9_-]+$/), category: z.string().min(1).max(60), categoryId: z.string().uuid().nullable().optional(),
  hall: z.string().max(60).nullable().optional(), zone: z.string().max(60).nullable().optional(),
  x: z.number().min(0), y: z.number().min(0), w: z.number().positive().max(10000), h: z.number().positive().max(10000),
  areaSqm: z.number().positive().max(10000).optional(), lengthM: z.number().positive().max(200).nullable().optional(), widthM: z.number().positive().max(200).nullable().optional(),
  dimensionLabel: z.string().max(40).nullable().optional(), rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  internalNotes: z.string().max(500).nullable().optional(), placed: z.boolean().default(true)
}).strict();
const schema = z.object({rowVersion: z.number().int().positive(), units: z.array(unit).max(500)}).strict();
const d1 = (n: number) => Math.round(n * 10) / 10;

/** Save draft geometry (FR-093–096, 112). Out-of-canvas and duplicate codes are rejected;
 * overlaps are returned as warnings. rowVersion is the optimistic lock. Audit stores a diff. */
export async function PUT(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const x = schema.parse(await req.json());
    const codes = x.units.map(u => u.code.toUpperCase());
    if (new Set(codes).size !== codes.length) throw new HttpError(400, "DUPLICATE_CODES", "Booth codes must be unique.");
    const units = x.units.map(u => {
      const area = u.areaSqm ?? (u.lengthM && u.widthM ? areaFrom(u.lengthM, u.widthM) : undefined);
      if (!area) throw new HttpError(400, "AREA_REQUIRED", "Unit " + u.code + " needs areaSqm or lengthM × widthM.");
      return {...u, areaSqm: d1(area), dimensionLabel: u.dimensionLabel ?? (u.lengthM && u.widthM ? dimensionLabelOf(u.lengthM, u.widthM) : null)};
    });
    const result = await db.$transaction(async tx => {
      const plan = await tx.floorplan.findUnique({where: {id}, include: {units: true}});
      if (!plan) throw new HttpError(404, "NOT_FOUND", "Plan not found.");
      // Drafts and live floors are editable (owner decision, Nov 2026); archived versions stay read-only history.
      if (plan.status === "ARCHIVED") throw new HttpError(409, "ARCHIVED", "Archived versions are read-only. Create a new draft from it to make changes.");
      if (plan.rowVersion !== x.rowVersion) throw new HttpError(409, "VERSION_CONFLICT", "Floorplan changed; reload before saving. Your local edits are kept in the editor.");
      for (const u of units) if (outOfCanvas(u, plan.canvasWidth, plan.canvasHeight)) throw new HttpError(400, "OUT_OF_BOUNDS", "Unit " + u.code + " is outside the floorplan.");
      const catIds = [...new Set(units.map(u => u.categoryId).filter(Boolean))] as string[];
      if (catIds.length && await tx.boothCategory.count({where: {id: {in: catIds}, eventId: plan.eventId}}) !== catIds.length) throw new HttpError(400, "BAD_CATEGORY", "Unknown booth category.");
      const existing = new Map(plan.units.map(u => [u.code.toUpperCase(), u]));
      const missing = plan.units.filter(u => !codes.includes(u.code.toUpperCase()));
      if (missing.some(u => u.status !== "AVAILABLE")) throw new HttpError(409, "UNIT_IN_USE", "An occupied, reserved or blocked booth cannot be removed.");
      if (plan.status === "PUBLISHED" && missing.length) {
        // On a live floor, a booth that is part of an open quotation keeps existing until the quotation is resolved.
        const ids = new Set(missing.map(u => u.id));
        const open = await tx.boothRequest.findMany({where: {floorplanId: id, status: {notIn: ["REJECTED", "CANCELLED"]}}, select: {offers: {orderBy: {revision: "desc"}, take: 1, select: {offeredUnitIds: true}}}});
        const quoted = missing.filter(u => open.some(r => Array.isArray(r.offers[0]?.offeredUnitIds) && (r.offers[0].offeredUnitIds as string[]).includes(u.id)) && ids.has(u.id));
        if (quoted.length) throw new HttpError(409, "UNIT_IN_QUOTATION", "Booth " + quoted.map(u => u.code).join(", ") + " is part of an open quotation; revise or close the quotation before removing it.");
        // Removed booths disappear from customers' preferences.
        for (const r of await tx.boothRequest.findMany({where: {floorplanId: id}, select: {id: true, preferredUnitIds: true}})) {
          const prefs = Array.isArray(r.preferredUnitIds) ? (r.preferredUnitIds as string[]) : [];
          if (prefs.some(p => ids.has(p))) await tx.boothRequest.update({where: {id: r.id}, data: {preferredUnitIds: prefs.filter(p => !ids.has(p))}});
        }
      }
      for (const old of missing) await tx.boothUnit.delete({where: {id: old.id}});
      const changed: string[] = [], added: string[] = [];
      for (const u of units) {
        const data = {category: u.category, categoryId: u.categoryId ?? null, hall: u.hall, zone: u.zone, x: u.x, y: u.y, w: u.w, h: u.h, areaSqm: u.areaSqm,
          lengthM: u.lengthM ?? null, widthM: u.widthM ?? null, dimensionLabel: u.dimensionLabel, rotation: u.rotation, internalNotes: u.internalNotes ?? null, placed: u.placed};
        const found = existing.get(u.code.toUpperCase());
        if (found) {
          const before = {x: found.x, y: found.y, w: found.w, h: found.h, area: Number(found.areaSqm), cat: found.category, rot: found.rotation, placed: found.placed};
          const after = {x: u.x, y: u.y, w: u.w, h: u.h, area: u.areaSqm, cat: u.category, rot: u.rotation, placed: u.placed};
          if (JSON.stringify(before) !== JSON.stringify(after)) changed.push(u.code);
          await tx.boothUnit.update({where: {id: found.id}, data});
        } else { added.push(u.code); await tx.boothUnit.create({data: {floorplanId: id, code: u.code, ...data}}); }
      }
      await tx.floorplan.update({where: {id}, data: {rowVersion: {increment: 1}}});
      await tx.auditLog.create({data: {adminId: actor.id, action: plan.status === "PUBLISHED" ? "FLOORPLAN_LIVE_UNITS_SAVED" : "FLOORPLAN_UNITS_SAVED", resourceType: "Floorplan", resourceId: id,
        beforeState: {rowVersion: plan.rowVersion, count: plan.units.length}, afterState: {count: units.length, added, changed, removed: missing.map(u => u.code)} as Prisma.InputJsonValue}});
      return {saved: units.length, rowVersion: plan.rowVersion + 1, unplaced: units.filter(u => !u.placed).length};
    }, {isolationLevel: "Serializable"});
    return NextResponse.json({...result, warnings: overlapWarnings(units)}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
