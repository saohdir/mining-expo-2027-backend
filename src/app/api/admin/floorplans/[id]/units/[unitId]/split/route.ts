import {NextRequest, NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {nextSplitCode, splitBox} from "@/lib/booth-split";

const schema = z.object({keepAreaSqm: z.number().positive().max(10000), reason: z.string().trim().min(8).max(500)}).strict();

/** Split a booth on a live floor: it keeps its code, bookings and the chosen area; the remaining area becomes a new,
 * available booth next to it (e.g. 10 m² → 5 m² for PT A + 5 m² free for another company). */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string; unitId: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id, unitId} = await params; z.string().uuid().parse(id); z.string().uuid().parse(unitId);
    const x = schema.parse(await req.json());
    const result = await db.$transaction(async tx => {
      const plan = await tx.floorplan.findUnique({where: {id}, include: {units: {select: {code: true}}}});
      if (!plan) throw new HttpError(404, "NOT_FOUND", "Floorplan missing.");
      if (plan.status !== "PUBLISHED") throw new HttpError(409, "NOT_LIVE", "Split booths on a live floor; in a draft, edit the booth directly.");
      const u = await tx.boothUnit.findFirst({where: {id: unitId, floorplanId: id}});
      if (!u) throw new HttpError(404, "NOT_FOUND", "Booth not found on this floor.");
      if (u.rotation) throw new HttpError(409, "ROTATED", "Rotated booths cannot be split here. Make a new version of the floor instead.");
      let parts;
      try { parts = splitBox({x: u.x, y: u.y, w: u.w, h: u.h, areaSqm: Number(u.areaSqm), lengthM: u.lengthM == null ? null : Number(u.lengthM), widthM: u.widthM == null ? null : Number(u.widthM)}, x.keepAreaSqm); }
      catch (e) { throw new HttpError(400, "BAD_AREA", (e as Error).message); }
      const code = nextSplitCode(u.code, new Set(plan.units.map(v => v.code.toUpperCase())));
      const dim = (b: {lengthM: number | null; widthM: number | null}) => b.lengthM && b.widthM ? b.lengthM + "×" + b.widthM : null;
      await tx.boothUnit.update({where: {id: u.id}, data: {w: parts.keep.w, h: parts.keep.h, areaSqm: parts.keep.areaSqm, lengthM: parts.keep.lengthM, widthM: parts.keep.widthM, dimensionLabel: dim(parts.keep) ?? u.dimensionLabel}});
      const rest = await tx.boothUnit.create({data: {floorplanId: id, code, category: u.category, categoryId: u.categoryId, hall: u.hall, zone: u.zone,
        x: parts.rest.x, y: parts.rest.y, w: parts.rest.w, h: parts.rest.h, areaSqm: parts.rest.areaSqm, lengthM: parts.rest.lengthM, widthM: parts.rest.widthM,
        dimensionLabel: dim(parts.rest), status: "AVAILABLE", splitFromId: u.id, placed: true}});
      await tx.floorplan.update({where: {id}, data: {rowVersion: {increment: 1}}});
      // Quotations already sent for the old size are not changed; Sales is told to review them.
      const offers = await tx.boothOffer.findMany({where: {boothRequest: {status: {notIn: ["CANCELLED", "REJECTED"]}}, offeredUnitIds: {array_contains: [u.id]}}, select: {boothRequestId: true}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "BOOTH_UNIT_SPLIT", resourceType: "BoothUnit", resourceId: u.id,
        beforeState: {code: u.code, areaSqm: Number(u.areaSqm)}, afterState: {keepAreaSqm: parts.keep.areaSqm, newCode: code, newAreaSqm: parts.rest.areaSqm, reason: x.reason}}});
      return {keep: {id: u.id, code: u.code, areaSqm: parts.keep.areaSqm}, rest: {id: rest.id, code, areaSqm: parts.rest.areaSqm}, quotationsToReview: [...new Set(offers.map(o => o.boothRequestId))]};
    }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json(result, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
