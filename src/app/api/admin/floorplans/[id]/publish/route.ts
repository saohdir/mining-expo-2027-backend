import {NextRequest, NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {floorplanBlockers} from "@/lib/floorplan-publication";

const schema = z.object({
  rowVersion: z.number().int().positive(),
  reason: z.string().trim().min(8).max(500),
  confirmReconciliation: z.literal(true)
}).strict();

export async function GET(_req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    await admin(["SUPER_ADMIN", "OPERATIONS", "SALES", "FINANCE"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const plan = await db.floorplan.findUnique({
      where: {id}, select: {eventId: true, status: true, rowVersion: true,
        _count: {select: {units: true}}}
    });
    if (!plan) throw new HttpError(404, "NOT_FOUND", "Floorplan missing.");
    const blockers = await floorplanBlockers(db, plan.eventId);
    return NextResponse.json({
      ...blockers, status: plan.status, rowVersion: plan.rowVersion,
      hasUnits: plan._count.units > 0,
      canPublish: blockers.canPublish && plan.status === "DRAFT" && plan._count.units > 0
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
      if (plan.status !== "DRAFT" || plan._count.units === 0) {
        throw new HttpError(409, "CANNOT_PUBLISH", "Only a nonempty draft can be published.");
      }
      if (plan.rowVersion !== input.rowVersion) {
        throw new HttpError(409, "VERSION_CONFLICT", "The floorplan changed; reload before publishing.");
      }
      const blockers = await floorplanBlockers(tx, plan.eventId);
      if (!blockers.canPublish) {
        throw new HttpError(409, "REMAP_REQUIRED",
          "Unresolved booth requests, active holds or assignments must be reconciled before replacing a published floorplan.");
      }
      const previous = await tx.floorplan.findMany({
        where: {eventId: plan.eventId, status: "PUBLISHED"},
        select: {id: true, versionNo: true}
      });
      await tx.floorplan.updateMany({
        where: {eventId: plan.eventId, status: "PUBLISHED"},
        data: {status: "ARCHIVED", rowVersion: {increment: 1}}
      });
      const changed = await tx.floorplan.updateMany({
        where: {id, status: "DRAFT", rowVersion: input.rowVersion},
        data: {status: "PUBLISHED", publishedAt: new Date(), rowVersion: {increment: 1}}
      });
      if (changed.count !== 1) throw new HttpError(409, "VERSION_CONFLICT", "Draft changed concurrently.");
      await tx.auditLog.create({
        data: {
          adminId: actor.id, action: "FLOORPLAN_PUBLISHED",
          resourceType: "Floorplan", resourceId: id,
          beforeState: {previous},
          afterState: {
            versionNo: plan.versionNo, reason: input.reason,
            confirmation: input.confirmReconciliation, blockers
          }
        }
      });
      return {id, versionNo: plan.versionNo};
    }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json({published: result.id, version: result.versionNo},
      {headers: {"Cache-Control": "private,no-store"}});
  } catch (error) {
    if (typeof error === "object" && error && "code" in error &&
        ["P2034", "P2002"].includes(String((error as {code?: unknown}).code))) {
      return failure(new HttpError(409, "PUBLISH_CONFLICT", "Publication changed; refresh and try again."));
    }
    return failure(error);
  }
}
