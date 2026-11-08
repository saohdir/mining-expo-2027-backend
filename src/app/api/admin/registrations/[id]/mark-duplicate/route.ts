import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {revokeEnrollmentPasses} from "@/lib/passes";

/** FR-153: resolve a duplicate registration — cancel it, revoke its passes, keep history, link the kept record. */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params; z.string().uuid().parse(id);
    const x = z.object({keepId: z.string().uuid(), reason: z.string().trim().min(10).max(400)}).strict().parse(await req.json());
    if (x.keepId === id) throw new HttpError(400, "SAME_RECORD", "Choose the registration to keep.");
    const out = await db.$transaction(async tx => {
      const [dup, keep] = await Promise.all([tx.enrollment.findUnique({where: {id}, include: {invoices: {where: {status: {notIn: ["CANCELLED", "VOID", "DRAFT"]}}}}}), tx.enrollment.findUnique({where: {id: x.keepId}})]);
      if (!dup || !keep) throw new HttpError(404, "NOT_FOUND", "Registration missing.");
      if (dup.accountId !== keep.accountId || dup.type !== keep.type || dup.conferenceId !== keep.conferenceId) throw new HttpError(409, "NOT_DUPLICATE", "Records are not duplicates (account/type/programme differ).");
      if (dup.invoices.length) throw new HttpError(409, "HAS_INVOICE", "Cancel or transfer the invoice through Finance first.");
      await tx.enrollment.update({where: {id}, data: {status: "CANCELLED"}});
      const revoked = await revokeEnrollmentPasses(tx, id, "DUPLICATE_OF:" + x.keepId);
      await tx.auditLog.create({data: {adminId: actor.id, action: "REGISTRATION_MARKED_DUPLICATE", resourceType: "Enrollment", resourceId: id, beforeState: {status: dup.status}, afterState: {status: "CANCELLED", keepId: x.keepId, revokedPasses: revoked, reason: x.reason}}});
      return {id, status: "CANCELLED", keptId: x.keepId, revokedPasses: revoked};
    });
    return NextResponse.json(out, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
