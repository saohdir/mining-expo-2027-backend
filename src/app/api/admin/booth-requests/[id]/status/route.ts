import {NextRequest, NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";

// OFFERED may only be set by the dedicated versioned /offer endpoint.
// ACCEPTED may only be set by the customer-specific latest-offer acceptance.
const schema = z.object({
  status: z.enum(["UNDER_REVIEW", "WAITING_INVOICE", "REJECTED", "CANCELLED"]),
  reason: z.string().min(8).max(500),
  override: z.boolean().optional()
}).strict();
const transitions: Record<string, string[]> = {
  NEW: ["UNDER_REVIEW", "REJECTED", "CANCELLED"],
  UNDER_REVIEW: ["REJECTED", "CANCELLED"],
  OFFERED: ["UNDER_REVIEW", "REJECTED", "CANCELLED"],
  ACCEPTED: ["WAITING_INVOICE", "CANCELLED"],
  WAITING_INVOICE: ["CANCELLED"]
};

export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SALES", "OPERATIONS", "SUPER_ADMIN"]);
    const {id} = await params;
    const input = schema.parse(await req.json());
    const changed = await db.$transaction(async tx => {
      const request = await tx.boothRequest.findUnique({
        where: {id}, include: {invoices: {select: {id: true}}}
      });
      if (!request) throw new HttpError(404, "NOT_FOUND", "Booth request missing.");
      // A Super Admin may force a status outside the normal order after confirming the warning (override:true).
      const forced = !(transitions[request.status] || []).includes(input.status);
      if (forced && !(input.override && actor.role === "SUPER_ADMIN")) {
        throw new HttpError(409, "INVALID_TRANSITION", "Invalid booth status transition.");
      }
      if (request.status === input.status) throw new HttpError(409, "INVALID_TRANSITION", "The request already has this status.");
      if (input.status === "CANCELLED" && request.invoices.length > 0) {
        throw new HttpError(409, "INVOICE_EXISTS",
          "A financial record exists. Use the authorized cancellation/refund workflow.");
      }
      const saved = await tx.boothRequest.updateMany({
        where: {id, status: request.status},
        data: {status: input.status}
      });
      if (saved.count !== 1) throw new HttpError(409, "STATUS_CHANGED", "Booking state changed.");
      await tx.auditLog.create({
        data: {
          adminId: actor.id, action: forced ? "BOOTH_STATUS_FORCED_OVERRIDE" : "BOOTH_STATUS_CHANGED",
          resourceType: "BoothRequest", resourceId: id,
          beforeState: {status: request.status},
          afterState: {status: input.status, reason: input.reason}
        }
      });
      await tx.notificationOutbox.create({
        data: {
          topic: "BOOTH_STATUS_UPDATED",
          dedupeKey: "booth-status:" + id + ":" + input.status + ":" + crypto.randomUUID(),
          payload: {id, status: input.status}
        }
      });
      return input.status;
    }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json({id, status: changed}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (error) {
    return failure(error);
  }
}
