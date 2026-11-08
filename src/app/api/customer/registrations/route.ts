import {shortCodeFor, shortCodeHash} from "@/lib/pass-code";
import {NextRequest, NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {customer} from "@/lib/auth";
import {db} from "@/lib/db";
import {requireEnabled} from "@/lib/policy";
import {failure, HttpError} from "@/lib/errors";
import {randomToken, hashToken, sealToken} from "@/lib/security";
import {ACTIVE_CONFERENCE_STATUSES, conferenceAvailability} from "@/lib/conference-capacity";

const schema = z.object({
  eventCode: z.string().default("IMDX-2027"),
  kind: z.enum(["VISITOR", "CONFERENCE"]),
  conferenceId: z.string().uuid().optional(),
  consent: z.literal(true)
}).strict();

function isSerializableConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as {code?: unknown}).code === "P2034";
}

export async function POST(req: NextRequest) {
  try {
    requireEnabled("registration");
    const account = await customer();
    const input = schema.parse(await req.json());
    if (input.kind === "CONFERENCE" && !input.conferenceId) {
      throw new HttpError(400, "CONFERENCE_REQUIRED", "Select a conference.");
    }
    if (input.kind === "VISITOR" && input.conferenceId) {
      throw new HttpError(400, "INVALID_INPUT", "Visitor registration must not include a conference.");
    }

    const profile = await db.customerProfile.findUnique({where: {accountId: account.id}});
    if (!profile || !profile.fullName.trim()) {
      throw new HttpError(400, "PROFILE_REQUIRED", "Complete your profile.");
    }
    const snapshot = {
      fullName: profile.fullName,
      organization: profile.organization,
      jobTitle: profile.jobTitle
    };

    // The duplicate check, capacity count and insert MUST be in one SERIALIZABLE
    // transaction. PostgreSQL aborts one of two concurrent last-seat bookings.
    async function createRegistration() {
      return db.$transaction(async tx => {
        const event = await tx.event.findUnique({where: {code: input.eventCode}});
        if (!event || !event.published) {
          throw new HttpError(404, "EVENT_NOT_FOUND", "Event is not open.");
        }
        if (input.kind === "VISITOR" && !event.visitorOpen) {
          throw new HttpError(409, "REGISTRATION_CLOSED", "Visitor registration is not open.");
        }

        const existing = await tx.enrollment.findFirst({
          where: {
            accountId: account.id,
            eventId: event.id,
            type: input.kind,
            conferenceId: input.kind === "CONFERENCE" ? input.conferenceId : null,
            status: {notIn: ["CANCELLED", "REJECTED"]}
          }
        });
        if (existing) {
          throw new HttpError(409, "ALREADY_REGISTERED", "This enrollment already exists.");
        }

        let conferenceId: string | null = null;
        if (input.kind === "CONFERENCE") {
          const conference = await tx.conference.findFirst({
            where: {id: input.conferenceId, eventId: event.id, published: true}
          });
          if (!conference) {
            throw new HttpError(404, "CONFERENCE_NOT_FOUND", "Conference not available.");
          }
          const active = await tx.enrollment.count({
            where: {
              conferenceId: conference.id,
              type: "CONFERENCE",
              status: {in: ACTIVE_CONFERENCE_STATUSES}
            }
          });
          const availability = conferenceAvailability(conference.capacity, active, conference.feeMinor);
          if (availability.registrationState === "NOT_READY") {
            throw new HttpError(409, "CONFERENCE_NOT_READY",
              "Conference capacity or approved fee is not published yet.");
          }
          if (availability.registrationState === "FULL") {
            throw new HttpError(409, "CONFERENCE_FULL",
              "No conference seats remain. Refresh the programme for updated availability.");
          }
          conferenceId = conference.id;
        }

        const approvedVisitor = input.kind === "VISITOR";
        const enrollment = await tx.enrollment.create({
          data: {
            accountId: account.id,
            eventId: event.id,
            type: input.kind,
            conferenceId,
            status: approvedVisitor ? "CONFIRMED" : "SUBMITTED",
            profileSnapshot: snapshot,
            consentAt: new Date(),
            confirmedAt: approvedVisitor ? new Date() : undefined
          }
        });
        if (approvedVisitor) {
          const token = randomToken();
          await tx.eventPass.create({
            data: {
              accountId: account.id,
              enrollmentId: enrollment.id,
              eventId: event.id,
              tokenHash: hashToken(token),
              shortCodeHash: shortCodeHash(shortCodeFor(token)),
              encryptedToken: sealToken(token),
              expiresAt: event.endsAt,
              entitlement: "EXPO_ENTRY"
            }
          });
        }
        if (approvedVisitor) await tx.notificationOutbox.create({data: {topic: "PASS_READY", dedupeKey: "pass-ready:" + enrollment.id, payload: {enrollmentId: enrollment.id}}});
        await tx.notification.create({
          data: {
            audienceRole: "OPERATIONS",
            type: "REGISTRATION_SUBMITTED",
            recordType: "Enrollment",
            recordId: enrollment.id
          }
        });
        return enrollment;
      }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
    }

    let enrollment: Awaited<ReturnType<typeof createRegistration>> | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        enrollment = await createRegistration();
        break;
      } catch (error) {
        if (!isSerializableConflict(error)) throw error;
        if (attempt === 2) {
          throw new HttpError(409, "REGISTRATION_CONFLICT",
            "Availability changed while registering. Please refresh and try again.");
        }
      }
    }
    if (!enrollment) throw new HttpError(409, "REGISTRATION_CONFLICT", "Please retry registration.");

    return NextResponse.json({
      id: enrollment.id,
      status: enrollment.status,
      message: "Registration recorded. Access depends on approved event policy."
    }, {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (error) {
    return failure(error);
  }
}
