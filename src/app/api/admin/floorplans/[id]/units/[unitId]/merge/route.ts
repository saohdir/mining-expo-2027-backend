import {NextRequest, NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {mergeBoxes} from "@/lib/booth-split";
import {unitCommitments} from "@/lib/floor-occupancy";

const schema = z.object({withUnitId: z.string().uuid(), reason: z.string().trim().min(8).max(500)}).strict();
const box = (u: {x: number; y: number; w: number; h: number; areaSqm: Prisma.Decimal; lengthM: Prisma.Decimal | null; widthM: Prisma.Decimal | null}) =>
  ({x: u.x, y: u.y, w: u.w, h: u.h, areaSqm: Number(u.areaSqm), lengthM: u.lengthM == null ? null : Number(u.lengthM), widthM: u.widthM == null ? null : Number(u.widthM)});

/** Undo a split: the split-off part (free, not requested by anyone) is merged back into the booth it came from. */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string; unitId: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id, unitId} = await params; z.string().uuid().parse(id); z.string().uuid().parse(unitId);
    const x = schema.parse(await req.json());
    const plan = await db.floorplan.findUnique({where: {id}, select: {status: true}});
    if (!plan) throw new HttpError(404, "NOT_FOUND", "Floorplan missing.");
    if (plan.status !== "PUBLISHED") throw new HttpError(409, "NOT_LIVE", "Merging is for split booths on a live floor.");
    const [a, b] = await Promise.all([db.boothUnit.findFirst({where: {id: unitId, floorplanId: id}}), db.boothUnit.findFirst({where: {id: x.withUnitId, floorplanId: id}})]);
    if (!a || !b) throw new HttpError(404, "NOT_FOUND", "Booth not found on this floor.");
    const [keep, gone] = b.splitFromId === a.id ? [a, b] : a.splitFromId === b.id ? [b, a] : [null, null];
    if (!keep || !gone) throw new HttpError(409, "NOT_SPLIT_PAIR", "Only a booth and the part split off from it can be merged.");
    const c = await unitCommitments(gone.id, id);
    if (gone.status !== "AVAILABLE" || gone.occupantCompany || c.holds || c.assignments || c.referenced) throw new HttpError(409, "PART_IN_USE", `${gone.code} is booked or requested; it cannot be merged back.`);
    const history = await db.boothHold.count({where: {boothUnitId: gone.id}}) + await db.boothAssignment.count({where: {boothUnitId: gone.id}});
    if (history) throw new HttpError(409, "PART_HAS_HISTORY", `${gone.code} has booking history; keep it as a separate booth.`);
    const m = mergeBoxes(box(keep), box(gone));
    const result = await db.$transaction(async tx => {
      await tx.boothUnit.delete({where: {id: gone.id}});
      await tx.boothUnit.updateMany({where: {splitFromId: gone.id}, data: {splitFromId: keep.id}});
      const r = await tx.boothUnit.update({where: {id: keep.id}, data: {x: m.x, y: m.y, w: m.w, h: m.h, areaSqm: m.areaSqm, lengthM: m.lengthM, widthM: m.widthM,
        dimensionLabel: m.lengthM && m.widthM ? m.lengthM + "×" + m.widthM : keep.dimensionLabel}});
      await tx.floorplan.update({where: {id}, data: {rowVersion: {increment: 1}}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "BOOTH_UNIT_MERGED", resourceType: "BoothUnit", resourceId: keep.id,
        beforeState: {codes: [keep.code, gone.code], areas: [Number(keep.areaSqm), Number(gone.areaSqm)]}, afterState: {areaSqm: m.areaSqm, reason: x.reason}}});
      return {id: r.id, code: r.code, areaSqm: Number(r.areaSqm)};
    }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json({unit: result}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
