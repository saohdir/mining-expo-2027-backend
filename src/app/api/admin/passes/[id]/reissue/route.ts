import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {hashToken, randomToken, sealToken} from "@/lib/security";
import {shortCodeFor, shortCodeHash} from "@/lib/pass-code";
const schema = z.object({reason: z.string().min(8).max(300)}).strict();
/** FR-075/137: reissue creates a new opaque token and invalidates the previous pass. */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params; z.string().uuid().parse(id);
    const x = schema.parse(await req.json());
    const created = await db.$transaction(async tx => {
      const old = await tx.eventPass.findUnique({where: {id}, include: {enrollment: true}});
      if (!old || old.replacedById) throw new HttpError(409, "ALREADY_REPLACED", "Pass missing or already replaced.");
      if (old.enrollment.status !== "CONFIRMED") throw new HttpError(409, "NOT_ELIGIBLE", "Only confirmed registrations can receive a pass.");
      const token = randomToken();
      const next = await tx.eventPass.create({data: {accountId: old.accountId, enrollmentId: old.enrollmentId, eventId: old.eventId, tokenHash: hashToken(token), shortCodeHash: shortCodeHash(shortCodeFor(token)),
        encryptedToken: sealToken(token), expiresAt: old.expiresAt, entitlement: old.entitlement}});
      await tx.eventPass.update({where: {id}, data: {status: "REVOKED", revokedAt: old.revokedAt ?? new Date(), revokeReason: old.revokeReason ?? "REISSUED: " + x.reason, replacedById: next.id}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "PASS_REISSUED", resourceType: "EventPass", resourceId: id, afterState: {newPassId: next.id, reason: x.reason}}});
      await tx.notificationOutbox.create({data: {topic: "PASS_REISSUED", dedupeKey: "pass-reissued:" + next.id, payload: {passId: next.id}}});
      return next;
    });
    return NextResponse.json({id: created.id, status: "ACTIVE", replaces: id}, {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
