import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {unitCommitments} from "@/lib/floor-occupancy";

const schema = z.object({
  company: z.string().trim().min(2).max(180).nullable(),
  contact: z.string().trim().max(200).nullable().optional(),
  status: z.enum(["RESERVED", "OCCUPIED"]).default("OCCUPIED"),
  reason: z.string().trim().min(8).max(500)
}).strict();

/** "Booked by" on a live floor for deals made outside the portal: company + contact, booth becomes Reserved/Occupied.
 * company = null clears a manual entry and frees the booth. Portal bookings (holds / assignments) already name the company
 * and cannot be overwritten here. */
export async function PUT(req: NextRequest, {params}: {params: Promise<{id: string; unitId: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS", "SALES"]);
    const {id, unitId} = await params; z.string().uuid().parse(id); z.string().uuid().parse(unitId);
    const x = schema.parse(await req.json());
    const plan = await db.floorplan.findUnique({where: {id}, select: {status: true}});
    if (!plan) throw new HttpError(404, "NOT_FOUND", "Floorplan missing.");
    if (plan.status !== "PUBLISHED") throw new HttpError(409, "NOT_LIVE", "Booked-by entries are made on a live floor. Drafts are edited in the layout editor.");
    const unit = await db.boothUnit.findFirst({where: {id: unitId, floorplanId: id}});
    if (!unit) throw new HttpError(404, "NOT_FOUND", "Booth not found on this floor.");
    const c = await unitCommitments(unitId, id);
    if (c.holds || c.assignments) throw new HttpError(409, "BOOKED_IN_PORTAL", "This booth is booked through the portal; the company comes from that booking (Booth Requests).");
    if (x.company && unit.status !== "AVAILABLE" && !unit.occupantCompany) throw new HttpError(409, "NOT_AVAILABLE", "Only an available booth (or one with a manual entry) can be marked as booked.");
    if (!x.company && !unit.occupantCompany) throw new HttpError(409, "NOTHING_TO_CLEAR", "This booth has no manual booking.");
    const updated = await db.$transaction(async tx => {
      const r = await tx.boothUnit.update({where: {id: unitId}, data: x.company
        ? {occupantCompany: x.company, occupantContact: x.contact || null, status: x.status}
        : {occupantCompany: null, occupantContact: null, status: "AVAILABLE"}});
      await tx.auditLog.create({data: {adminId: actor.id, action: x.company ? "BOOTH_OCCUPANT_SET" : "BOOTH_OCCUPANT_CLEARED", resourceType: "BoothUnit", resourceId: unitId,
        beforeState: {status: unit.status, company: unit.occupantCompany}, afterState: {status: r.status, company: r.occupantCompany, reason: x.reason}}});
      return r;
    });
    return NextResponse.json({unit: {id: updated.id, code: updated.code, status: updated.status, occupantCompany: updated.occupantCompany, occupantContact: updated.occupantContact}}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
