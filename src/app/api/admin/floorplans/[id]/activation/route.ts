import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";

const schema = z.object({active: z.boolean(), reason: z.string().trim().min(8).max(500)}).strict();

/** Switch a live floor Active / Inactive. Customers and the public site see active floors only; existing bookings,
 * quotations and invoices on an inactive floor stay valid and remain manageable in the CMS. */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params; z.string().uuid().parse(id);
    const x = schema.parse(await req.json());
    const plan = await db.$transaction(async tx => {
      const p = await tx.floorplan.findUnique({where: {id}});
      if (!p) throw new HttpError(404, "NOT_FOUND", "Floorplan missing.");
      if (p.status !== "PUBLISHED") throw new HttpError(409, "NOT_LIVE", "Only a published floor can be switched active or inactive.");
      const r = await tx.floorplan.update({where: {id}, data: {active: x.active, rowVersion: {increment: 1}}});
      await tx.auditLog.create({data: {adminId: actor.id, action: x.active ? "FLOORPLAN_ACTIVATED" : "FLOORPLAN_DEACTIVATED", resourceType: "Floorplan", resourceId: id,
        beforeState: {active: p.active}, afterState: {active: x.active, reason: x.reason}}});
      return r;
    }, {isolationLevel: "Serializable"});
    return NextResponse.json({plan: {id: plan.id, active: plan.active, rowVersion: plan.rowVersion}}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
