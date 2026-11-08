import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {ACTIVE_CONFERENCE_STATUSES, conferenceAvailability} from "@/lib/conference-capacity";

/** FR-155 manual release: when a seat is free, create a SUBMITTED registration for the next person
 * (capacity re-checked in a SERIALIZABLE transaction). Payment/approval rules then apply as usual. */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params; z.string().uuid().parse(id);
    const {reason} = z.object({reason: z.string().trim().min(8).max(300)}).strict().parse(await req.json());
    const out = await db.$transaction(async tx => {
      const entry = await tx.waitlistEntry.findUnique({where: {id}});
      if (!entry || entry.status !== "WAITING") throw new HttpError(409, "NOT_WAITING", "Entry is not waiting.");
      const conf = await tx.conference.findUniqueOrThrow({where: {id: entry.conferenceId}});
      const active = await tx.enrollment.count({where: {conferenceId: conf.id, type: "CONFERENCE", status: {in: ACTIVE_CONFERENCE_STATUSES}}});
      if (conferenceAvailability(conf.capacity, active, conf.feeMinor).registrationState === "FULL") throw new HttpError(409, "STILL_FULL", "No seat is free yet.");
      const profile = await tx.customerProfile.findUnique({where: {accountId: entry.accountId}});
      const enrollment = await tx.enrollment.create({data: {accountId: entry.accountId, eventId: conf.eventId, conferenceId: conf.id, type: "CONFERENCE", status: "SUBMITTED",
        profileSnapshot: {fullName: profile?.fullName ?? "", organization: profile?.organization ?? null, jobTitle: profile?.jobTitle ?? null, source: "WAITLIST"}, consentAt: new Date()}});
      await tx.waitlistEntry.update({where: {id}, data: {status: "OFFERED", releasedAt: new Date(), releasedBy: actor.id, enrollmentId: enrollment.id}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "WAITLIST_RELEASED", resourceType: "Enrollment", resourceId: enrollment.id, afterState: {waitlistId: id, reason}}});
      await tx.notificationOutbox.create({data: {topic: "ENROLLMENT_REVIEWED", dedupeKey: "waitlist:" + id, payload: {enrollmentId: enrollment.id}}});
      return {enrollmentId: enrollment.id, status: "SUBMITTED"};
    }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json(out, {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
