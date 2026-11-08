import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
const NEXT: Record<string, string[]> = {NEW: ["CONTACTED", "QUALIFIED", "CLOSED"], CONTACTED: ["QUALIFIED", "CLOSED"], QUALIFIED: ["CONTACTED", "CLOSED"], CLOSED: ["CONTACTED"]};
/** FR-036 status NEW → CONTACTED → QUALIFIED → CLOSED with audit history. */
export async function PATCH(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "SALES"]);
    const {id} = await params; z.string().uuid().parse(id);
    const x = z.object({status: z.enum(["NEW", "CONTACTED", "QUALIFIED", "CLOSED"]), reason: z.string().trim().min(4).max(400)}).strict().parse(await req.json());
    const out = await db.$transaction(async tx => {
      const l = await tx.lead.findUnique({where: {id}});
      if (!l) throw new HttpError(404, "NOT_FOUND", "Lead not found.");
      if (!NEXT[l.status]?.includes(x.status)) throw new HttpError(409, "BAD_TRANSITION", `Cannot move lead from ${l.status} to ${x.status}.`);
      await tx.lead.update({where: {id}, data: {status: x.status}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "LEAD_STATUS_CHANGED", resourceType: "Lead", resourceId: id, beforeState: {status: l.status}, afterState: {status: x.status, reason: x.reason}}});
      return {id, status: x.status};
    });
    return NextResponse.json(out, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
