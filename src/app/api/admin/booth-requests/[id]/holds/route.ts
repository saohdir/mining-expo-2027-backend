import {NextRequest, NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {uniqueOfferedIds} from "@/lib/booth-offers";

const createSchema = z.object({
  expiresInHours: z.number().int().min(1).max(168),
  reason: z.string().trim().min(8).max(500)
}).strict();
const releaseSchema = z.object({
  reason: z.string().trim().min(8).max(500)
}).strict();

const conflicts = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error &&
  ["P2034", "P2002"].includes(String((error as {code?: unknown}).code));

export async function GET(_req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    await admin(["SUPER_ADMIN", "OPERATIONS", "SALES", "FINANCE"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const request = await db.boothRequest.findUnique({where: {id}, select: {id: true}});
    if (!request) throw new HttpError(404, "NOT_FOUND", "Booth request not found.");
    const holds = await db.boothHold.findMany({
      where: {boothRequestId: id},
      orderBy: {createdAt: "desc"}, take: 100,
      select: {
        id: true, status: true, createdAt: true, expiresAt: true,
        endedAt: true, endReason: true,
        boothUnit: {select: {code: true, hall: true}}
      }
    });
    return NextResponse.json({holds}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (error) {return failure(error);}
}

/** Operations may reserve ONLY the complete accepted quotation. Preferences,
 * SALES quotes, or customer acceptance never create a physical hold.
 */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const input = createSchema.parse(await req.json());
    const result = await db.$transaction(async tx => {
      const request = await tx.boothRequest.findUnique({
        where: {id},
        include: {
          floorplan: {select: {status: true, versionNo: true}},
          offers: {orderBy: {revision: "desc"}, take: 1},
          assignments: {where: {active: true}, select: {id: true}}
        }
      });
      if (!request) throw new HttpError(404, "NOT_FOUND", "Booth request missing.");
      if (!["ACCEPTED", "WAITING_INVOICE", "INVOICED", "ALLOCATION_PENDING"].includes(request.status)) {
        throw new HttpError(409, "HOLD_NOT_ALLOWED", "Only accepted unallocated bookings can be held.");
      }
      if (request.assignments.length) throw new HttpError(409, "ALREADY_ASSIGNED", "Booking already allocated.");
      const offer = request.offers[0];
      if (!offer || !offer.acceptedAt) {
        throw new HttpError(409, "OFFER_NOT_ACCEPTED", "Customer has not accepted the latest offer.");
      }
      if (request.floorplan.status !== "PUBLISHED" ||
          request.floorplan.versionNo !== offer.floorplanVersionNo) {
        throw new HttpError(409, "FLOORPLAN_CHANGED", "Published plan has changed; reconcile before holding.");
      }
      const unitIds = uniqueOfferedIds(offer.offeredUnitIds);
      const units = await tx.boothUnit.findMany({
        where: {id: {in: unitIds}, floorplanId: request.floorplanId},
        select: {id: true, status: true}
      });
      if (units.length !== unitIds.length || units.some(unit => unit.status !== "AVAILABLE")) {
        throw new HttpError(409, "UNAVAILABLE", "At least one unit is not available.");
      }
      if (await tx.boothHold.count({where: {boothUnitId: {in: unitIds}, status: "ACTIVE"}}) ||
          await tx.boothAssignment.count({where: {boothUnitId: {in: unitIds}, active: true}})) {
        throw new HttpError(409, "HELD_OR_ASSIGNED", "A unit has another active hold or assignment.");
      }
      const now = new Date();
      const expiresAt = new Date(now.getTime() + input.expiresInHours * 3600000);
      const created: string[] = [];
      for (const unitId of unitIds) {
        const changed = await tx.boothUnit.updateMany({
          where: {id: unitId, status: "AVAILABLE"}, data: {status: "RESERVED"}
        });
        if (changed.count !== 1) throw new HttpError(409, "CONCURRENT_HOLD", "Unit was reserved by another operation.");
        const hold = await tx.boothHold.create({
          data: {boothUnitId: unitId, boothRequestId: id, createdBy: actor.id, expiresAt}
        });
        created.push(hold.id);
      }
      await tx.auditLog.create({
        data: {adminId: actor.id, action: "BOOTH_HOLD_CREATED", resourceType: "BoothRequest",
          resourceId: id, afterState: {offerId: offer.id, holdIds: created, unitIds,
            expiresAt: expiresAt.toISOString(), reason: input.reason}}
      });
      return {holdIds: created, expiresAt};
    }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json({...result, status: "ACTIVE"},
      {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (error) {
    return failure(conflicts(error) ? new HttpError(409, "HOLD_CONFLICT", "Availability changed, refresh and retry.") : error);
  }
}

/** Controlled release of every active hold for one request. Never remove an assignment. */
export async function DELETE(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const {reason} = releaseSchema.parse(await req.json());
    const count = await db.$transaction(async tx => {
      const request = await tx.boothRequest.findUnique({where: {id}, select: {id: true}});
      if (!request) throw new HttpError(404, "NOT_FOUND", "Booth request missing.");
      const active = await tx.boothHold.findMany({
        where: {boothRequestId: id, status: "ACTIVE"}, select: {id: true, boothUnitId: true}
      });
      if (!active.length) throw new HttpError(409, "NO_ACTIVE_HOLDS", "No active hold remains.");
      const now = new Date();
      for (const hold of active) {
        await tx.boothHold.updateMany({
          where: {id: hold.id, status: "ACTIVE"},
          data: {status: "RELEASED", endedAt: now, endedBy: actor.id, endReason: reason}
        });
        const assigned = await tx.boothAssignment.count({
          where: {boothUnitId: hold.boothUnitId, active: true}
        });
        const other = await tx.boothHold.count({
          where: {boothUnitId: hold.boothUnitId, status: "ACTIVE"}
        });
        if (!assigned && !other) await tx.boothUnit.updateMany({
          where: {id: hold.boothUnitId, status: "RESERVED"},
          data: {status: "AVAILABLE"}
        });
      }
      await tx.auditLog.create({
        data: {adminId: actor.id, action: "BOOTH_HOLD_RELEASED",
          resourceType: "BoothRequest", resourceId: id,
          afterState: {holdIds: active.map(h => h.id), reason}}
      });
      return active.length;
    }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json({released: count}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (error) {
    return failure(conflicts(error) ? new HttpError(409, "HOLD_CONFLICT", "Inventory changed, refresh and retry.") : error);
  }
}
