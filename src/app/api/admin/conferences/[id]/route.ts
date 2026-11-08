import {NextRequest, NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {ACTIVE_CONFERENCE_STATUSES} from "@/lib/conference-capacity";

const schema = z.object({
  title: z.string().min(10).max(200).optional(),
  slug: z.string().regex(/^[a-z0-9-]{3,90}$/).optional(),
  startsAt: z.string().datetime().nullable().optional(),
  feeMinor: z.string().regex(/^\d+$/).nullable().optional(),
  capacity: z.number().int().positive().max(100000).nullable().optional(),
  published: z.boolean().optional(),
  reason: z.string().min(8).max(500)
}).strict();

export async function PATCH(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params;
    const input = schema.parse(await req.json());
    const result = await db.$transaction(async tx => {
      const old = await tx.conference.findUnique({
        where: {id},
        include: {event: true, _count: {select: {enrollments: true}}}
      });
      if (!old) throw new HttpError(404, "NOT_FOUND", "Conference missing.");
      if (old._count.enrollments > 0 && (input.feeMinor !== undefined || input.slug !== undefined)) {
        throw new HttpError(409, "LOCKED_FIELDS",
          "Fee and slug cannot be changed after the first registration.");
      }

      // Lowering capacity below active bookings would invalidate already accepted
      // seats. Read the count inside the same serializable transaction as update.
      const activeEnrollmentCount = await tx.enrollment.count({
        where: {conferenceId: id, type: "CONFERENCE", status: {in: ACTIVE_CONFERENCE_STATUSES}}
      });
      if (input.capacity !== undefined && activeEnrollmentCount > 0 &&
          (input.capacity === null || input.capacity < activeEnrollmentCount)) {
        throw new HttpError(409, "CAPACITY_BELOW_BOOKINGS",
          "Capacity must not be lower than existing active conference bookings.");
      }
      if (input.published === true) {
        if (input.feeMinor === null ||
            (input.feeMinor === undefined && old.feeMinor === null)) {
          throw new HttpError(409, "FEE_TBD",
            "Set an approved fee (including zero for free) before publishing.");
        }
        if (!old.event.published) {
          throw new HttpError(409, "EVENT_DRAFT", "Publish parent event first.");
        }
      }

      const {reason, ...props} = input;
      const updated = await tx.conference.update({
        where: {id},
        data: {
          ...props,
          feeMinor: props.feeMinor === undefined ? undefined
            : props.feeMinor === null ? null : BigInt(props.feeMinor),
          startsAt: props.startsAt === undefined ? undefined
            : props.startsAt === null ? null : new Date(props.startsAt)
        }
      });
      await tx.auditLog.create({
        data: {
          adminId: actor.id,
          action: "CONFERENCE_CHANGED",
          resourceType: "Conference",
          resourceId: id,
          beforeState: {
            published: old.published,
            capacity: old.capacity,
            feeMinor: old.feeMinor?.toString()
          },
          afterState: {
            published: updated.published,
            capacity: updated.capacity,
            activeEnrollmentCount,
            feeMinor: updated.feeMinor?.toString(),
            reason
          }
        }
      });
      return updated;
    }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json({
      id: result.id,
      published: result.published,
      capacity: result.capacity,
      feeMinor: result.feeMinor?.toString() ?? null
    }, {headers: {"Cache-Control": "private,no-store"}});
  } catch (error) {
    return failure(error);
  }
}
