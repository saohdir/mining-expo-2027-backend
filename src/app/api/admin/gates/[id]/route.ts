import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";

const schema = z.object({
  name: z.string().min(2).max(80).optional(), zones: z.array(z.string().regex(/^[A-Z0-9_]{2,40}$/)).min(1).max(10).optional(),
  active: z.boolean().optional(), staffAdminIds: z.array(z.string().uuid()).max(200).optional(), reason: z.string().min(8).max(300)
}).strict();

/** Update gate zones/status and the staff allowed to scan there (audited). */
export async function PATCH(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const x = schema.parse(await req.json());
    const out = await db.$transaction(async tx => {
      const before = await tx.gate.findUnique({where: {id}, include: {staff: true}});
      if (!before) throw new HttpError(404, "NOT_FOUND", "Gate missing.");
      const g = await tx.gate.update({where: {id}, data: {name: x.name, zones: x.zones ? [...new Set(x.zones)] : undefined, active: x.active}});
      if (x.staffAdminIds) {
        const staff = await tx.adminUser.findMany({where: {id: {in: x.staffAdminIds}, active: true, role: {in: ["CHECKIN_STAFF", "OPERATIONS", "SUPER_ADMIN"]}}, select: {id: true}});
        if (staff.length !== new Set(x.staffAdminIds).size) throw new HttpError(400, "BAD_STAFF", "Only active scanner-capable staff can be assigned.");
        await tx.staffGateAssignment.deleteMany({where: {gateId: id, adminId: {notIn: x.staffAdminIds}}});
        for (const s of staff) await tx.staffGateAssignment.upsert({where: {adminId_gateId: {adminId: s.id, gateId: id}}, update: {}, create: {adminId: s.id, gateId: id, createdBy: actor.id}});
      }
      await tx.auditLog.create({data: {adminId: actor.id, action: "GATE_UPDATED", resourceType: "Gate", resourceId: id,
        beforeState: {zones: before.zones, active: before.active, staff: before.staff.map(s => s.adminId)},
        afterState: {zones: g.zones, active: g.active, staff: x.staffAdminIds ?? before.staff.map(s => s.adminId), reason: x.reason}}});
      return g;
    });
    return NextResponse.json({gate: out}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
