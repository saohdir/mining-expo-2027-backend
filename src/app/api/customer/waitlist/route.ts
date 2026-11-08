import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {customer} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {requireEnabled} from "@/lib/policy";
import {ACTIVE_CONFERENCE_STATUSES, conferenceAvailability} from "@/lib/conference-capacity";

/** FR-155: join the waitlist of a FULL conference. A waitlist place is not a booking and holds no seat. */
export async function POST(req: NextRequest) {
  try {
    requireEnabled("registration");
    const acc = await customer();
    const {conferenceId} = z.object({conferenceId: z.string().uuid()}).strict().parse(await req.json());
    const conf = await db.conference.findFirst({where: {id: conferenceId, published: true, event: {published: true}}});
    if (!conf) throw new HttpError(404, "CONFERENCE_NOT_FOUND", "Conference not available.");
    const active = await db.enrollment.count({where: {conferenceId, type: "CONFERENCE", status: {in: ACTIVE_CONFERENCE_STATUSES}}});
    if (conferenceAvailability(conf.capacity, active, conf.feeMinor).registrationState !== "FULL") throw new HttpError(409, "NOT_FULL", "Seats are available — register directly.");
    if (await db.enrollment.count({where: {conferenceId, accountId: acc.id, status: {notIn: ["CANCELLED", "REJECTED"]}}})) throw new HttpError(409, "ALREADY_REGISTERED", "You already hold a registration for this conference.");
    const entry = await db.waitlistEntry.upsert({where: {conferenceId_accountId: {conferenceId, accountId: acc.id}}, update: {}, create: {conferenceId, accountId: acc.id}});
    const position = await db.waitlistEntry.count({where: {conferenceId, status: "WAITING", createdAt: {lte: entry.createdAt}}});
    return NextResponse.json({id: entry.id, status: entry.status, position, message: "You are on the waitlist. This is not a booking; the organizer will contact you if a seat is released."}, {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
