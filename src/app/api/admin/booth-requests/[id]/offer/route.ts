import {NextRequest, NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {quoteMinor} from "@/lib/booth-offers";

const schema = z.object({
  offeredUnitIds: z.array(z.string().uuid()).min(1).max(6),
  quotedPriceMinor: z.string(),
  reason: z.string().min(8).max(500),
  notes: z.string().max(1000).optional(),
  expiresAt: z.string().datetime().optional()
}).strict();

export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "SALES", "OPERATIONS"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const input = schema.parse(await req.json());
    const ids = input.offeredUnitIds;
    if (new Set(ids).size !== ids.length) {
      throw new HttpError(400, "DUPLICATE_UNITS", "Each offered booth unit must be unique.");
    }
    const price = quoteMinor(input.quotedPriceMinor);
    if (input.expiresAt && new Date(input.expiresAt) <= new Date()) {
      throw new HttpError(400, "OFFER_EXPIRY", "Offer expiry must be in the future.");
    }

    const result = await db.$transaction(async tx => {
      const request = await tx.boothRequest.findUnique({
        where: {id},
        include: {
          floorplan: {select: {status: true, versionNo: true}},
          invoices: {select: {id: true}},
          offers: {orderBy: {revision: "desc"}, take: 1, select: {revision: true}}
        }
      });
      if (!request) throw new HttpError(404, "NOT_FOUND", "Booth request not found.");
      if (!["UNDER_REVIEW", "OFFERED"].includes(request.status)) {
        throw new HttpError(409, "INVALID_STATE", "Only booth requests under review can receive a quotation.");
      }
      if (request.invoices.length) {
        throw new HttpError(409, "INVOICE_ALREADY_EXISTS", "Do not revise a quote after an invoice was created.");
      }
      if (request.floorplan.status !== "PUBLISHED") {
        throw new HttpError(409, "FLOORPLAN_NOT_CURRENT",
          "The requested floorplan was archived. Operations must reconcile the map before issuing an offer.");
      }

      const units = await tx.boothUnit.findMany({
        where: {floorplanId: request.floorplanId, id: {in: ids}},
        select: {id: true, code: true, hall: true, zone: true, areaSqm: true, status: true}
      });
      if (units.length !== ids.length || units.some(unit => unit.status !== "AVAILABLE")) {
        throw new HttpError(409, "BOOTH_UNAVAILABLE",
          "One or more proposed units are unavailable. Refresh the floorplan.");
      }
      const activeAssignment = await tx.boothAssignment.findFirst({
        where: {boothUnitId: {in: ids}, active: true},
        select: {id: true}
      });
      if (activeAssignment) {
        throw new HttpError(409, "ALREADY_ASSIGNED",
          "An offered unit already has an active assignment. Operations must reconcile inventory.");
      }
      const sortedUnits = ids.map(unitId => units.find(unit => unit.id === unitId)!);
      const areaTenths = sortedUnits.reduce((sum, unit) =>
        sum + Math.round(Number(unit.areaSqm) * 10), 0);
      const area = areaTenths / 10;
      if (!(area > 0 && area <= 10000)) {
        throw new HttpError(409, "INVALID_AREA", "Offered units exceed approved area bounds.");
      }

      const revision = (request.offers[0]?.revision ?? 0) + 1;
      const offer = await tx.boothOffer.create({
        data: {
          boothRequestId: id,
          revision,
          floorplanVersionNo: request.floorplan.versionNo,
          offeredUnitIds: ids,
          offeredUnits: sortedUnits.map(unit => ({
            id: unit.id,
            code: unit.code,
            hall: unit.hall,
            zone: unit.zone,
            areaSqm: unit.areaSqm.toString()
          })),
          offeredAreaSqm: area,
          quotedPriceMinor: price,
          notes: input.notes,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          offeredBy: actor.id
        }
      });
      const changed = await tx.boothRequest.updateMany({
        where: {id, status: {in: ["UNDER_REVIEW", "OFFERED"]}},
        data: {status: "OFFERED", offeredAreaSqm: area}
      });
      if (changed.count !== 1) {
        throw new HttpError(409, "REQUEST_CHANGED", "Booking status changed; refresh before retrying.");
      }
      await tx.auditLog.create({
        data: {
          adminId: actor.id, action: "BOOTH_OFFER_PROPOSED",
          resourceType: "BoothRequest", resourceId: id,
          beforeState: {status: request.status, previousRevision: revision - 1},
          afterState: {
            offerId: offer.id, revision, offeredUnitIds: ids,
            offeredAreaSqm: String(area), quotedPriceMinor: price.toString(),
            reason: input.reason
          }
        }
      });
      await tx.notification.create({
        data: {audienceRole: "SALES", type: "BOOTH_OFFER_READY", recordType: "BoothRequest", recordId: id}
      });
      await tx.notificationOutbox.create({
        data: {
          topic: "BOOTH_OFFER_READY", dedupeKey: "booth-offer:" + offer.id,
          payload: {boothRequestId: id, offerId: offer.id, revision}
        }
      });
      return offer;
    }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});

    return NextResponse.json({
      id: result.id, revision: result.revision, status: "OFFERED",
      offeredAreaSqm: result.offeredAreaSqm.toString(),
      quotedPriceMinor: result.quotedPriceMinor.toString(),
      message: "Quotation saved. No unit has been reserved."
    }, {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error &&
        (error as {code?: unknown}).code === "P2034") {
      return failure(new HttpError(409, "CONCURRENT_UPDATE", "Offer changed. Refresh and retry."));
    }
    return failure(error);
  }
}
