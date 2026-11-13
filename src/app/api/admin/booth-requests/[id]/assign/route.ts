import {NextRequest, NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {financeTotals} from "@/lib/policy";
import {areaMismatch} from "@/lib/floorplan-geometry";
import {uniqueOfferedIds} from "@/lib/booth-offers";
import {holdsMatchBooking} from "@/lib/floorplan-safety";

const schema = z.object({
  reason: z.string().min(8).max(400),
  approvedForPublic: z.boolean().default(false),
  // FR-101: required when the units' current area differs from the accepted quotation snapshot.
  areaOverrideReason: z.string().trim().min(10).max(400).optional()
}).strict();

export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["OPERATIONS", "SUPER_ADMIN"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const input = schema.parse(await req.json());

    const assigned = await db.$transaction(async tx => {
      const request = await tx.boothRequest.findUnique({
        where: {id},
        include: {
          offers: {orderBy: {revision: "desc"}, take: 1},
          invoices: {include: {transfers: true, adjustments: true, items: {select: {kind: true, amountMinor: true}}}},
          floorplan: {select: {status: true, versionNo: true}},
          assignments: {where: {active: true}, select: {id: true}}
        }
      });
      if (!request) throw new HttpError(404, "NOT_FOUND", "Booth request missing.");
      if (!["ACCEPTED", "WAITING_INVOICE", "INVOICED", "ALLOCATION_PENDING"].includes(request.status)) {
        throw new HttpError(409, "NOT_APPROVED", "Booth request must be approved and not already assigned.");
      }
      if (request.assignments.length) {
        throw new HttpError(409, "ALREADY_ASSIGNED", "This request has active assignments. Use a reviewed reassignment workflow.");
      }

      const offer = request.offers[0];
      if (!offer || !offer.acceptedAt) {
        throw new HttpError(409, "OFFER_NOT_ACCEPTED", "Customer must accept the latest quotation first.");
      }
      if (request.floorplan.status !== "PUBLISHED" ||
          request.floorplan.versionNo !== offer.floorplanVersionNo) {
        throw new HttpError(409, "STALE_FLOORPLAN",
          "The offered floorplan has changed. Do not allocate without an approved remap.");
      }
      const ids = uniqueOfferedIds(offer.offeredUnitIds);
      const confirmed = request.invoices.some(invoice => {
        // The quotation is the pre-tax price: compare it with the invoice's item subtotal, as invoice drafting and
        // revision do. Configured TAX/FEE lines (e.g. VAT) are added on top and are covered by the PAID_IN_FULL check.
        const itemSubtotal = invoice.items.filter(i => i.kind === "ITEM").reduce((a, i) => a + i.amountMinor, 0n);
        if (itemSubtotal !== offer.quotedPriceMinor ||
            !["PARTIALLY_PAID", "PAID"].includes(invoice.status)) return false;
        const totals = financeTotals(invoice.totalMinor, invoice.transfers, invoice.adjustments.filter(r=>r.type==="REVERSAL").map(r=>r.amountMinor));
        return totals.state === "PAID_IN_FULL" ||
          (process.env.ALLOW_BOOTH_ALLOCATION_ON_DP === "true" && totals.state === "DP_RECEIVED");
      });
      if (!confirmed) {
        throw new HttpError(409, "PAYMENT_REQUIRED",
          "Finance must verify payment against the accepted quotation before assignment.");
      }

      const activeHolds = await tx.boothHold.findMany({
        where: {boothUnitId: {in: ids}, status: "ACTIVE"},
        select: {id: true, boothUnitId: true, boothRequestId: true, expiresAt: true}
      });
      const usingHolds = activeHolds.length > 0;
      if (usingHolds && !holdsMatchBooking(activeHolds, ids, id, new Date())) {
        throw new HttpError(409, "HOLD_EXPIRED_OR_MISMATCHED",
          "Quoted units have an expired or mismatched hold. Release/reconcile before allocating.");
      }
      const expectedStatus = usingHolds ? "RESERVED" : "AVAILABLE";
      const units = await tx.boothUnit.findMany({
        where: {floorplanId: request.floorplanId, id: {in: ids}},
        select: {id: true, code: true, status: true, areaSqm: true}
      });
      if (units.length !== ids.length || units.some(u => u.status !== expectedStatus)) {
        throw new HttpError(409, "ALREADY_OCCUPIED", "One or more offered booth units are unavailable.");
      }
      const currentArea = units.reduce((a, u) => a + Number(u.areaSqm), 0);
      const mismatch = areaMismatch(currentArea, Number(offer.offeredAreaSqm));
      if (mismatch && !input.areaOverrideReason) {
        throw new HttpError(409, "AREA_MISMATCH", "Units now measure " + (Math.round(currentArea * 10) / 10) + " m² but the accepted quotation states " + offer.offeredAreaSqm.toString() + " m². Provide an override reason to continue.");
      }
      if (mismatch) {
        await tx.auditLog.create({data: {adminId: actor.id, action: "BOOTH_AREA_OVERRIDE", resourceType: "BoothRequest", resourceId: id,
          afterState: {currentAreaSqm: currentArea, quotedAreaSqm: offer.offeredAreaSqm.toString(), reason: input.areaOverrideReason}}});
      }
      const existing = await tx.boothAssignment.findFirst({
        where: {boothUnitId: {in: ids}, active: true},
        select: {id: true}
      });
      if (existing) {
        throw new HttpError(409, "ACTIVE_ASSIGNMENT_EXISTS", "A booth unit already has an active assignment.");
      }

      const assignments = [];
      for (const unitId of ids) {
        const change = await tx.boothUnit.updateMany({
          where: {id: unitId, floorplanId: request.floorplanId, status: expectedStatus},
          data: {
            status: "OCCUPIED",
            approvedPublicName: input.approvedForPublic
              ? String((request.companySnapshot as {name?: string}).name || "")
              : null
          }
        });
        if (change.count !== 1) {
          throw new HttpError(409, "ALREADY_OCCUPIED", "Booth was occupied during assignment.");
        }
        assignments.push(await tx.boothAssignment.create({
          data: {
            boothUnitId: unitId, boothRequestId: id,
            assignedBy: actor.id, approvedForPublic: input.approvedForPublic
          }
        }));
      }
      if (usingHolds) {
        await tx.boothHold.updateMany({
          where: {boothRequestId: id, status: "ACTIVE", boothUnitId: {in: ids}},
          data: {status: "RELEASED", endedAt: new Date(), endedBy: actor.id, endReason: "ASSIGNED"}
        });
      }
      const changed = await tx.boothRequest.updateMany({
        where: {id, status: {in: ["ACCEPTED", "WAITING_INVOICE", "INVOICED", "ALLOCATION_PENDING"]}},
        data: {status: "CONFIRMED"}
      });
      if (changed.count !== 1) throw new HttpError(409, "STATUS_CHANGED", "Booking changed during allocation.");

      await tx.auditLog.create({
        data: {
          adminId: actor.id, action: "BOOTH_ASSIGNED",
          resourceType: "BoothRequest", resourceId: id,
          afterState: {
            offerId: offer.id, quoteRevision: offer.revision,
            boothUnitIds: ids, assignmentIds: assignments.map(a => a.id),
            reason: input.reason
          }
        }
      });
      await tx.notificationOutbox.create({
        data: {
          topic: "BOOTH_ASSIGNED",
          dedupeKey: "booth-assigned:" + id + ":" + offer.id,
          payload: {boothRequestId: id, offerId: offer.id}
        }
      });
      return assignments;
    }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});

    return NextResponse.json({
      status: "CONFIRMED", assignmentIds: assigned.map(a => a.id),
      boothUnitIds: assigned.map(a => a.boothUnitId)
    }, {headers: {"Cache-Control": "private,no-store"}});
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      const code = (error as {code?: unknown}).code;
      if (code === "P2034" || code === "P2002") {
        return failure(new HttpError(409, "ALLOCATION_CONFLICT",
          "A booth was allocated concurrently. Refresh inventory and review another position."));
      }
    }
    return failure(error);
  }
}
