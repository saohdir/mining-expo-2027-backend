import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {AdminRole} from "@prisma/client";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {hashPassword} from "@/lib/security";

const schema = z.object({role: z.nativeEnum(AdminRole).optional(), active: z.boolean().optional(), newPassword: z.string().min(14).max(200).optional(), reason: z.string().min(8).max(300), override: z.boolean().optional()}).strict();
/** Role change, deactivate (sessions revoked) or password reset. Never removes the last active SUPER_ADMIN. */
export async function PATCH(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN"]);
    const {id} = await params; z.string().uuid().parse(id);
    const x = schema.parse(await req.json());
    const out = await db.$transaction(async tx => {
      const before = await tx.adminUser.findUnique({where: {id}});
      if (!before) throw new HttpError(404, "NOT_FOUND", "Staff not found.");
      const losingSuper = before.role === "SUPER_ADMIN" && before.active && ((x.role && x.role !== "SUPER_ADMIN") || x.active === false);
      if (losingSuper && await tx.adminUser.count({where: {role: "SUPER_ADMIN", active: true}}) <= 1) throw new HttpError(409, "LAST_SUPER_ADMIN", "Keep at least one active Super Admin.");
      // Changing your own Super Admin access is allowed after the override warning, as long as another active Super Admin remains (checked above).
      const selfChange = id === actor.id && (x.active === false || (!!x.role && x.role !== "SUPER_ADMIN"));
      if (selfChange && !x.override) throw new HttpError(409, "SELF_LOCKOUT", "You cannot demote or deactivate yourself.");
      const u = await tx.adminUser.update({where: {id}, data: {role: x.role, active: x.active, ...(x.newPassword ? {passwordHash: hashPassword(x.newPassword)} : {})}});
      if (x.active === false || x.newPassword || (x.role && x.role !== before.role)) await tx.adminSession.deleteMany({where: {adminId: id}});
      if (x.active === false || (x.role && !["CHECKIN_STAFF", "OPERATIONS", "SUPER_ADMIN"].includes(x.role))) await tx.staffGateAssignment.deleteMany({where: {adminId: id}});
      await tx.auditLog.create({data: {adminId: actor.id, action: selfChange ? "STAFF_SELF_CHANGE_OVERRIDE" : "STAFF_UPDATED", resourceType: "AdminUser", resourceId: id, beforeState: {role: before.role, active: before.active},
        afterState: {role: u.role, active: u.active, passwordReset: !!x.newPassword, reason: x.reason}}});
      return {id, role: u.role, active: u.active};
    });
    return NextResponse.json(out, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
