import {buildRemap, applyRemap} from "@/lib/floorplan-remap";
import {NextRequest, NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {floorplanBlockers} from "@/lib/floorplan-publication";

// Publishing has no prerequisites any more (owner decision, Nov 2026): reason/confirmations are optional; bookings on a
// replaced floor are moved automatically by booth code, and committed booths missing from the draft are copied into it.
const schema = z.object({
  rowVersion: z.number().int().positive(),
  reason: z.string().trim().max(500).optional(),
  confirmReconciliation: z.boolean().optional(),
  approveRemap: z.boolean().optional(),
  remapHash: z.string().max(64).optional()
}).strict();

export async function GET(_req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    await admin(["SUPER_ADMIN", "OPERATIONS", "SALES", "FINANCE"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const plan = await db.floorplan.findUnique({
      where: {id}, select: {eventId: true, status: true, rowVersion: true, replacesId: true,
        _count: {select: {units: true}}}
    });
    if (!plan) throw new HttpError(404, "NOT_FOUND", "Floorplan missing.");
    const blockers = await floorplanBlockers(db, plan.replacesId);
    const replaces = plan.replacesId ? await db.floorplan.findUnique({where: {id: plan.replacesId}, select: {id: true, title: true, versionNo: true, status: true}}) : null;
    return NextResponse.json({
      ...blockers, status: plan.status, rowVersion: plan.rowVersion, replaces,
      hasUnits: plan._count.units > 0,
      canPublish: plan.status === "DRAFT", needsRemap: !blockers.canPublish
    }, {headers: {"Cache-Control": "private,no-store"}});
  } catch (error) {return failure(error);}
}

export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const input = schema.parse(await req.json());
    const result = await db.$transaction(async tx => {
      const plan = await tx.floorplan.findUnique({
        where: {id}, include: {_count: {select: {units: true}}}
      });
      if (!plan) throw new HttpError(404, "NOT_FOUND", "Floorplan missing.");
      if (plan.status !== "DRAFT") throw new HttpError(409, "CANNOT_PUBLISH", "This version is already live or archived.");
      if (plan.rowVersion !== input.rowVersion) {
        throw new HttpError(409, "VERSION_CONFLICT", "The floorplan changed; reload before publishing.");
      }
      // A draft replaces only the floor it was made from (replacesId); if that floor is no longer live it goes live as an additional floor.
      let replaced = plan.replacesId ? await tx.floorplan.findUnique({where: {id: plan.replacesId}, select: {id: true, status: true, active: true}}) : null;
      if (replaced && replaced.status !== "PUBLISHED") {
        replaced = null;
        await tx.floorplan.update({where: {id}, data: {replacesId: null}});
      }
      const blockers = await floorplanBlockers(tx, replaced?.id ?? null);
      let remap: {moved: number; requests?: number; restoredUnits?: string[]} | null = null;
      const restoredUnits: string[] = [];
      if (!blockers.canPublish) {
        // Committed booths (assigned, held, accepted quotation) that are missing in the draft are copied from the live floor,
        // so every booking keeps its booth; then everything is moved by code (FR-098 remap, applied automatically).
        let preview = await buildRemap(tx, id);
        if (preview.report.blocking.length && preview.published) {
          const have = new Set(preview.draft.units.map(u => u.code.toUpperCase()));
          for (const code of preview.report.blocking) {
            const old = preview.published.units.find(u => u.code.toUpperCase() === code.toUpperCase());
            if (!old || have.has(code.toUpperCase())) continue;
            await tx.boothUnit.create({data: {floorplanId: id, code: old.code, category: old.category, categoryId: old.categoryId, hall: old.hall, zone: old.zone,
              x: old.x, y: old.y, w: old.w, h: old.h, areaSqm: old.areaSqm, lengthM: old.lengthM, widthM: old.widthM, dimensionLabel: old.dimensionLabel,
              rotation: old.rotation, internalNotes: old.internalNotes, placed: old.placed, status: "AVAILABLE"}});
            restoredUnits.push(old.code);
          }
          preview = await buildRemap(tx, id);
        }
        remap = {...await applyRemap(tx, preview, actor.id), restoredUnits};
      }
      const previous = replaced ? await tx.floorplan.findMany({
        where: {id: replaced.id, status: "PUBLISHED"},
        select: {id: true, versionNo: true}
      }) : [];
      if (replaced) await tx.floorplan.updateMany({
        where: {id: replaced.id, status: "PUBLISHED"},
        data: {status: "ARCHIVED", rowVersion: {increment: 1}}
      });
      const changed = await tx.floorplan.updateMany({
        where: {id, status: "DRAFT", rowVersion: input.rowVersion},
        data: {status: "PUBLISHED", publishedAt: new Date(), active: replaced ? replaced.active : true, rowVersion: {increment: 1}}
      });
      if (changed.count !== 1) throw new HttpError(409, "VERSION_CONFLICT", "Draft changed concurrently.");
      await tx.auditLog.create({
        data: {
          adminId: actor.id, action: "FLOORPLAN_PUBLISHED",
          resourceType: "Floorplan", resourceId: id,
          beforeState: {previous},
          afterState: {
            versionNo: plan.versionNo, reason: input.reason || "Published from the floorplan editor",
            blockers, remap
          }
        }
      });
      return {id, versionNo: plan.versionNo, remap, replaced: replaced?.id ?? null};
    }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json({published: result.id, version: result.versionNo, remap: result.remap},
      {headers: {"Cache-Control": "private,no-store"}});
  } catch (error) {
    if (typeof error === "object" && error && "code" in error &&
        ["P2034", "P2002"].includes(String((error as {code?: unknown}).code))) {
      return failure(new HttpError(409, "PUBLISH_CONFLICT", "Publication changed; refresh and try again."));
    }
    return failure(error);
  }
}
