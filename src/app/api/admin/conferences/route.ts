import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {ACTIVE_CONFERENCE_STATUSES, conferenceAvailability} from "@/lib/conference-capacity";

const schema = z.object({
  eventCode: z.string().default("IMDX-2027"),
  title: z.string().min(10).max(200),
  slug: z.string().min(3).max(90).regex(/^[a-z0-9-]+$/),
  startsAt: z.string().datetime().nullable().optional(),
  feeMinor: z.string().regex(/^\d+$/).nullable().optional(),
  capacity: z.number().int().positive().max(100000).nullable().optional()
}).strict();

export async function GET() {
  try {
    await admin(["SUPER_ADMIN", "OPERATIONS", "CONTENT_EDITOR", "FINANCE", "SALES"]);
    const data = await db.conference.findMany({
      orderBy: {title: "asc"},
      include: {event: {select: {code: true, title: true}}, _count: {select: {enrollments: true}}}
    });
    const ids = data.map(conference => conference.id);
    const groups = ids.length ? await db.enrollment.groupBy({
      by: ["conferenceId"],
      where: {
        conferenceId: {in: ids},
        type: "CONFERENCE",
        status: {in: ACTIVE_CONFERENCE_STATUSES}
      },
      _count: {_all: true}
    }) : [];
    const activeCounts = new Map(groups.map(group => [group.conferenceId, group._count._all]));
    const records = data.map(conference => {
      const activeEnrollmentCount = activeCounts.get(conference.id) ?? 0;
      return {
        ...conference,
        activeEnrollmentCount,
        ...conferenceAvailability(conference.capacity, activeEnrollmentCount, conference.feeMinor),
        feeMinor: conference.feeMinor === null ? null : conference.feeMinor.toString()
      };
    });
    return NextResponse.json({records}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const input = schema.parse(await req.json());
    const event = await db.event.findUnique({where: {code: input.eventCode}});
    if (!event) throw new HttpError(404, "EVENT_NOT_FOUND", "Event missing.");
    const created = await db.$transaction(async tx => {
      const conference = await tx.conference.create({
        data: {
          eventId: event.id,
          title: input.title,
          slug: input.slug,
          startsAt: input.startsAt ? new Date(input.startsAt) : null,
          feeMinor: input.feeMinor === null || input.feeMinor === undefined ? null : BigInt(input.feeMinor),
          capacity: input.capacity ?? null,
          published: false
        }
      });
      await tx.auditLog.create({
        data: {
          adminId: actor.id,
          action: "CONFERENCE_DRAFT_CREATED",
          resourceType: "Conference",
          resourceId: conference.id,
          afterState: {title: conference.title, slug: conference.slug}
        }
      });
      return conference;
    });
    return NextResponse.json({id: created.id, status: "DRAFT"},
      {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (error) {
    return failure(error);
  }
}
