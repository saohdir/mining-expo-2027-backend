import {NextRequest, NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {cloneBoothStatus} from "@/lib/floorplan-safety";

const schema = z.object({
  title: z.string().min(3).max(160),
  reason: z.string().trim().min(8).max(500)
}).strict();

/** A restore is always a NEW DRAFT derived from a historical edition.
 * Never reactivate an archived edition in place or transfer old booth IDs.
 */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const input = schema.parse(await req.json());
    const created = await db.$transaction(async tx => {
      const source = await tx.floorplan.findUnique({
        where: {id},
        include: {units: {orderBy: {code: "asc"}}}
      });
      if (!source) throw new HttpError(404, "NOT_FOUND", "Floorplan source not found.");
      if (source.units.length > 500) {
        throw new HttpError(409, "TOO_MANY_UNITS", "This plan exceeds the approved clone limit.");
      }
      const last = await tx.floorplan.findFirst({
        where: {eventId: source.eventId}, orderBy: {versionNo: "desc"},
        select: {versionNo: true}
      });
      const version = (last?.versionNo ?? 0) + 1;
      const plan = await tx.floorplan.create({
        data: {
          eventId: source.eventId, versionNo: version, title: input.title,
          canvasWidth: source.canvasWidth, canvasHeight: source.canvasHeight,
          backgroundUrl: source.backgroundUrl, status: "DRAFT",
          units: {create: source.units.map(unit => ({
            code: unit.code, category: unit.category, hall: unit.hall, zone: unit.zone,
            x: unit.x, y: unit.y, w: unit.w, h: unit.h,
            areaSqm: unit.areaSqm,
            // A new version must NOT claim historic allocated, reserved,
            // or blocked geometry is free to sell.
            status: cloneBoothStatus(unit.status)
          }))}
        }
      });
      await tx.auditLog.create({
        data: {
          adminId: actor.id,
          action: "FLOORPLAN_DRAFT_CLONED",
          resourceType: "Floorplan", resourceId: plan.id,
          afterState: {
            sourceFloorplanId: source.id, sourceVersionNo: source.versionNo,
            targetVersionNo: version, copiedUnits: source.units.length,
            blockedUnits: source.units.filter(u => u.status !== "AVAILABLE").length,
            reason: input.reason
          }
        }
      });
      return {id: plan.id, versionNo: version};
    }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json({plan: created}, {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (error) {
    if (typeof error === "object" && error && "code" in error &&
        ["P2034", "P2002"].includes(String((error as {code?: unknown}).code))) {
      return failure(new HttpError(409, "VERSION_CONFLICT", "A new version was created simultaneously. Retry."));
    }
    return failure(error);
  }
}
