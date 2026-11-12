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
  // A booth dragged a little past the left/top edge snaps to 0 instead of failing the whole save.
  x: z.number().finite().transform(v => Math.max(0, v)), y: z.number().finite().transform(v => Math.max(0, v)), w: z.number().positive().max(10000), h: z.number().positive().max(10000),
  // Empty area / length / width (null or 0) = not set: the area is then taken from length × width (AREA_REQUIRED if neither).
  areaSqm: z.number().min(0).max(10000).nullable().optional().transform(v => v || undefined),
  lengthM: z.number().min(0).max(200).nullable().optional().transform(v => v || null), widthM: z.number().min(0).max(200).nullable().optional().transform(v => v || null),
  dimensionLabel: z.string().max(40).nullable().optional(), rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  internalNotes: z.string().max(500).nullable().optional(), placed: z.boolean().default(true)
}).strict();
const schema = z.object({rowVersion: z.number().int().positive(), units: z.array(unit).max(500)}).strict();
const FIELD: Record<string, string> = {code: "booth code may only use letters, numbers, - and _ (max 25 characters)", category: "category is required",
  x: "position (x) must be a number", y: "position (y) must be a number", w: "width on the plan must be greater than 0", h: "height on the plan must be greater than 0",
  areaSqm: "area (m²) must be a number up to 10,000", lengthM: "length (m) must be a number up to 200", widthM: "width (m) must be a number up to 200",
  rotation: "rotation must be 0, 90, 180 or 270", categoryId: "unknown category", hall: "hall is too long (max 60)", zone: "zone is too long (max 60)",
  dimensionLabel: "size label is too long (max 40)", internalNotes: "notes are too long (max 500)"};
/** One readable sentence per problem ("Booth A 12: booth code may only use …") instead of a bare 400. */
function unitProblems(body: unknown, err: z.ZodError) {
  const list = (body as {units?: {code?: unknown}[]})?.units || [];
  const lines = err.issues.map(i => {
    if (i.path[0] !== "units") return i.path.join(".") === "rowVersion" ? "Reload the floor and try again." : i.path.length ? i.path.join(".") + ": " + i.message : "Too many booths (max 500) or the request is malformed.";
    const n = Number(i.path[1]), code = typeof list[n]?.code === "string" && list[n].code ? String(list[n].code) : "#" + (n + 1);
    return `Booth ${code}: ${FIELD[String(i.path[2])] || String(i.path[2] ?? "") + " " + i.message}`;
  });
  const uniq = [...new Set(lines)];
  return uniq.slice(0, 6).join("; ") + (uniq.length > 6 ? `; and ${uniq.length - 6} more` : "") + ".";
}
const d1 = (n: number) => Math.round(n * 10) / 10;

/** Save draft geometry (FR-093–096, 112). Out-of-canvas and duplicate codes are rejected;
 * overlaps are returned as warnings. rowVersion is the optimistic lock. Audit stores a diff. */
export async function PUT(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new HttpError(400, "INVALID_UNITS", "Cannot save: " + unitProblems(body, parsed.error));
    const x = parsed.data;
    const codes = x.units.map(u => u.code.toUpperCase());
    const dup = [...new Set(codes.filter((c, i) => codes.indexOf(c) !== i))];
    if (dup.length) throw new HttpError(400, "DUPLICATE_CODES", "Booth codes must be unique; used more than once: " + dup.join(", ") + ".");
    const units = x.units.map(u => {
      const area = u.areaSqm ?? (u.lengthM && u.widthM ? areaFrom(u.lengthM, u.widthM) : undefined);
      if (!area) throw new HttpError(400, "AREA_REQUIRED", "Booth " + u.code + " needs an area (m²) or a length × width.");
      return {...u, areaSqm: d1(area), dimensionLabel: u.dimensionLabel ?? (u.lengthM && u.widthM ? dimensionLabelOf(u.lengthM, u.widthM) : null)};
    });
    const result = await db.$transaction(async tx => {
      const plan = await tx.floorplan.findUnique({where: {id}, include: {units: true}});
      if (!plan) throw new HttpError(404, "NOT_FOUND", "Plan not found.");
      // Drafts and live floors are editable (owner decision, Nov 2026); archived versions stay read-only history.
      if (plan.status === "ARCHIVED") throw new HttpError(409, "ARCHIVED", "Archived versions are read-only. Create a new draft from it to make changes.");
      if (plan.rowVersion !== x.rowVersion) throw new HttpError(409, "VERSION_CONFLICT", "Floorplan changed; reload before saving. Your local edits are kept in the editor.");
      for (const u of units) if (outOfCanvas(u, plan.canvasWidth, plan.canvasHeight)) throw new HttpError(400, "OUT_OF_BOUNDS", `Booth ${u.code} is outside the floor area (${plan.canvasWidth} × ${plan.canvasHeight}); move it inside or make it smaller.`);
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
