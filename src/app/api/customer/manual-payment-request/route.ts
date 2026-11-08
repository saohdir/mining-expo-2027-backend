import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {customer} from "@/lib/auth";
import {db} from "@/lib/db";
import {failure, HttpError} from "@/lib/errors";
import {requireEnabled} from "@/lib/policy";

const schema = z.object({
  enrollmentId: z.string().uuid().optional(),
  boothRequestId: z.string().uuid().optional()
}).strict().refine(x => Boolean(x.enrollmentId) !== Boolean(x.boothRequestId),
  "Provide exactly one booking reference");

export async function POST(req: NextRequest) {
  try {
    requireEnabled("registration");
    const account = await customer();
    const input = schema.parse(await req.json());

    if (input.enrollmentId) {
      const enrollment = await db.enrollment.findFirst({
        where: {id: input.enrollmentId, accountId: account.id, type: "CONFERENCE"},
        include: {conference: true}
      });
      if (!enrollment) throw new HttpError(404, "BOOKING_NOT_FOUND", "Conference booking not found.");
      if (["REJECTED", "CANCELLED", "CONFIRMED"].includes(enrollment.status)) {
        throw new HttpError(409, "BOOKING_NOT_PAYABLE",
          "This conference booking cannot request a new invoice in its current state.");
      }
      if (!enrollment.conference || enrollment.conference.feeMinor === null) {
        throw new HttpError(409, "FEE_NOT_APPROVED", "Conference fee has not been approved.");
      }
      if (enrollment.conference.feeMinor === 0n) {
        throw new HttpError(409, "FREE_CONFERENCE",
          "This conference is free; organizer confirmation does not require an invoice.");
      }
    } else {
      const booth = await db.boothRequest.findFirst({
        where: {id: input.boothRequestId, accountId: account.id},
        include: {offers: {orderBy: {revision: "desc"}, take: 1}}
      });
      if (!booth) throw new HttpError(404, "BOOKING_NOT_FOUND", "Booth request not found.");
      if (!["ACCEPTED", "WAITING_INVOICE", "INVOICED", "ALLOCATION_PENDING"].includes(booth.status) ||
          !booth.offers[0]?.acceptedAt) {
        throw new HttpError(409, "OFFER_NOT_ACCEPTED",
          "Accept the latest organizer quotation before requesting an invoice.");
      }
    }

    const request = await db.$transaction(async tx => {
      const existing = await tx.manualPaymentRequest.findFirst({
        where: {
          accountId: account.id,
          enrollmentId: input.enrollmentId ?? null,
          boothRequestId: input.boothRequestId ?? null,
          status: {not: "CANCELLED"}
        }
      });
      if (existing) throw new HttpError(409, "PAYMENT_REQUEST_EXISTS",
        "A payment request for this booking already exists. Check your invoice or contact the organizer.");

      const created = await tx.manualPaymentRequest.create({
        data: {
          accountId: account.id,
          enrollmentId: input.enrollmentId,
          boothRequestId: input.boothRequestId
        }
      });
      await tx.notification.create({
        data: {
          audienceRole: "FINANCE",
          type: "MANUAL_PAYMENT_REQUEST",
          recordType: "ManualPaymentRequest",
          recordId: created.id
        }
      });
      await tx.notificationOutbox.create({
        data: {
          topic: "MANUAL_PAYMENT_REQUEST",
          dedupeKey: "payment-request:" + created.id,
          payload: {id: created.id}
        }
      });
      return created;
    }, {isolationLevel: "Serializable"});

    return NextResponse.json({
      id: request.id,
      status: request.status,
      message: "Admin will prepare an invoice; no payment has been confirmed."
    }, {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error &&
        (error as {code?: unknown}).code === "P2034") {
      return failure(new HttpError(409, "CONCURRENT_UPDATE",
        "This booking changed during processing. Please refresh and try again."));
    }
    return failure(error);
  }
}
