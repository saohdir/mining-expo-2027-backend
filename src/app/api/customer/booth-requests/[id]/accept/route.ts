import {NextRequest, NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/lib/db";
import {customer} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {uniqueOfferedIds} from "@/lib/booth-offers";

const schema = z.object({offerId: z.string().uuid()}).strict();

export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const account = await customer();
    const {id} = await params;
    z.string().uuid().parse(id);
    const {offerId} = schema.parse(await req.json());

    const accepted = await db.$transaction(async tx => {
      const request = await tx.boothRequest.findFirst({
        where: {id, accountId: account.id},
        include: {
          floorplan: {select: {status: true, versionNo: true}},
          offers: {orderBy: {revision: "desc"}, take: 1}
        }
      });
      if (!request) throw new HttpError(404, "NOT_FOUND", "Booth request not found.");
      if (request.status !== "OFFERED") {
        throw new HttpError(409, "NOT_OFFERED", "No pending offer is awaiting acceptance.");
      }
      const offer = request.offers[0];
      if (!offer || offer.id !== offerId || offer.acceptedAt) {
        throw new HttpError(409, "OFFER_REVISION_CHANGED",
          "This offer is no longer the latest revision. Refresh to review current terms.");
      }
      if (offer.expiresAt && offer.expiresAt <= new Date()) {
        throw new HttpError(409, "OFFER_EXPIRED", "The quotation has expired. Ask the organizer for a revision.");
      }
      if (request.floorplan.status !== "PUBLISHED" ||
          offer.floorplanVersionNo !== request.floorplan.versionNo) {
        throw new HttpError(409, "FLOORPLAN_CHANGED",
          "Floorplan availability changed. Contact Operations for a revised offer.");
      }
      const ids = uniqueOfferedIds(offer.offeredUnitIds);
      const units = await tx.boothUnit.findMany({
        where: {floorplanId: request.floorplanId, id: {in: ids}},
        select: {id: true, status: true}
      });
      if (units.length !== ids.length || units.some(unit => unit.status !== "AVAILABLE")) {
        throw new HttpError(409, "OFFER_UNIT_UNAVAILABLE",
          "An offered booth is no longer available. Request a revised offer.");
      }
      const activeAssignment = await tx.boothAssignment.findFirst({
        where: {boothUnitId: {in: ids}, active: true},
        select: {id: true}
      });
      if (activeAssignment) {
        throw new HttpError(409, "ALREADY_ASSIGNED",
          "The offered booth inventory has changed. Request a revised quotation.");
      }

      const marked = await tx.boothOffer.updateMany({
        where: {id: offer.id, boothRequestId: id, acceptedAt: null},
        data: {acceptedAt: new Date()}
      });
      if (marked.count !== 1) {
        throw new HttpError(409, "OFFER_CHANGED", "This offer changed while accepting it.");
      }
      const updated = await tx.boothRequest.updateMany({
        where: {id, accountId: account.id, status: "OFFERED"},
        data: {status: "ACCEPTED"}
      });
      if (updated.count !== 1) throw new HttpError(409, "BOOKING_CHANGED", "Booking changed. Refresh and retry.");

      await tx.auditLog.create({
        data: {
          accountId: account.id, action: "BOOTH_OFFER_ACCEPTED",
          resourceType: "BoothRequest", resourceId: id,
          beforeState: {status: "OFFERED"},
          afterState: {
            status: "ACCEPTED", offerId, revision: offer.revision,
            quotedPriceMinor: offer.quotedPriceMinor.toString()
          }
        }
      });
      await tx.notification.create({
        data: {
          audienceRole: "SALES", type: "CUSTOMER_ACCEPTED_BOOTH_OFFER",
          recordType: "BoothRequest", recordId: id
        }
      });
      return offer;
    }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});

    return NextResponse.json({
      status: "ACCEPTED", acceptedOfferId: accepted.id,
      message: "Quotation accepted. Final allocation still requires verified funds and Operations approval. No booth is held yet."
    }, {headers: {"Cache-Control": "private,no-store"}});
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error &&
        (error as {code?: unknown}).code === "P2034") {
      return failure(new HttpError(409, "CONCURRENT_UPDATE", "Offer was updated. Refresh and retry."));
    }
    return failure(error);
  }
}
