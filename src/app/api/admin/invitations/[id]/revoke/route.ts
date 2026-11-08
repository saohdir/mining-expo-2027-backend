import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {revokeInvitation} from "@/lib/invitations";

const schema = z.object({reason: z.string().min(8).max(500)}).strict();
/** Organizer revokes any invitation (open → closed; accepted → the pass it issued is revoked). Audited. */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params; z.string().uuid().parse(id);
    const {reason} = schema.parse(await req.json());
    const out = await db.$transaction(async tx => {
      const before = await tx.invitation.findUnique({where: {id}});
      if (!before) throw new HttpError(404, "NOT_FOUND", "Invitation not found.");
      const r = await revokeInvitation(tx, id, reason);
      await tx.auditLog.create({data: {adminId: actor.id, action: "INVITATION_REVOKED", resourceType: "Invitation", resourceId: id, beforeState: {status: before.status, kind: before.kind}, afterState: {status: r.status, reason}}});
      return r;
    });
    return NextResponse.json({id: out.id, status: out.status}, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
