import {NextRequest, NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";

const schema = z.object({
  rowVersion: z.number().int().positive(),
  reason: z.string().trim().min(8).max(500)
}).strict();

/** Explicit unblock of cloned historical geometry. Never changes old edition,
 * assignment or hold, and publication remains blocked by open commitments.
 */
export async function POST(req: NextRequest,
  {params}: {params: Promise<{id: string; unitId: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id, unitId} = await params;
    z.string().uuid().parse(id);
    z.string().uuid().parse(unitId);
    const input = schema.parse(await req.json());
    const data = await db.$transaction(async tx => {
      const plan = await tx.floorplan.findUnique({where: {id}});
      if (!plan || plan.status !== "DRAFT") {
        throw new HttpError(409, "NOT_DRAFT", "Only a draft unit can be unblocked.");
      }
      if (plan.rowVersion !== input.rowVersion) {
        throw new HttpError(409, "VERSION_CONFLICT", "Floorplan changed; reload before changing unit availability.");
      }
      const unit = await tx.boothUnit.findFirst({
        where: {id: unitId, floorplanId: id}
      });
      if (!unit || unit.status !== "BLOCKED") {
        throw new HttpError(409, "NOT_BLOCKED", "Selected unit is not blocked.");
      }
      const [holds, assignments] = await Promise.all([
        tx.boothHold.count({where: {boothUnitId: unitId, status: "ACTIVE"}}),
        tx.boothAssignment.count({where: {boothUnitId: unitId, active: true}})
      ]);
      if (holds || assignments) {
        throw new HttpError(409, "UNIT_IN_USE", "Active commitments prevent release.");
      }
      const saved = await tx.boothUnit.updateMany({
        where: {id: unitId, floorplanId: id, status: "BLOCKED"},
        data: {status: "AVAILABLE"}
      });
      if (saved.count !== 1) throw new HttpError(409, "UNIT_CHANGED", "Unit changed concurrently.");
      const planChanged = await tx.floorplan.updateMany({
        where: {id, status: "DRAFT", rowVersion: input.rowVersion},
        data: {rowVersion: {increment: 1}}
      });
      if (planChanged.count !== 1) throw new HttpError(409, "VERSION_CONFLICT", "Floorplan changed concurrently.");
      await tx.auditLog.create({
        data: {
          adminId: actor.id, action: "FLOORPLAN_UNIT_UNBLOCKED",
          resourceType: "BoothUnit", resourceId: unitId,
          beforeState: {status: "BLOCKED"},
          afterState: {
            status: "AVAILABLE", floorplanId: id, code: unit.code,
            reason: input.reason
          }
        }
      });
      return {id: unitId, status: "AVAILABLE", rowVersion: plan.rowVersion + 1};
    }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json(data, {headers: {"Cache-Control": "private,no-store"}});
  } catch (error) {
    return failure(error);
  }
}
