import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {failure} from "@/lib/errors";
import {ACTIVE_CONFERENCE_STATUSES, conferenceAvailability} from "@/lib/conference-capacity";

export async function GET() {
  try {
    const events = await db.event.findMany({
      where: {published: true},
      select: {
        id: true, code: true, title: true, venue: true, startsAt: true, endsAt: true,
        conferences: {
          where: {published: true},
          select: {
            id: true, title: true, slug: true, startsAt: true,
            capacity: true, feeMinor: true, currency: true
          }
        }
      }
    });
    const ids = events.flatMap(event => event.conferences.map(conference => conference.id));
    const counts = ids.length ? await db.enrollment.groupBy({
      by: ["conferenceId"],
      where: {
        conferenceId: {in: ids},
        type: "CONFERENCE",
        status: {in: ACTIVE_CONFERENCE_STATUSES}
      },
      _count: {_all: true}
    }) : [];
    const countByConference = new Map(counts.map(x => [x.conferenceId, x._count._all]));

    const projected = events.map(event => ({
      ...event,
      conferences: event.conferences.map(conference => ({
        ...conference,
        feeMinor: conference.feeMinor?.toString() ?? null,
        ...conferenceAvailability(
          conference.capacity,
          countByConference.get(conference.id) ?? 0,
          conference.feeMinor
        )
      }))
    }));
    // Remaining-seat figures are informational; server-side booking validates
    // capacity again inside a serializable transaction.
    return NextResponse.json({events: projected}, {headers: {"Cache-Control": "no-store"}});
  } catch (error) {
    return failure(error);
  }
}
