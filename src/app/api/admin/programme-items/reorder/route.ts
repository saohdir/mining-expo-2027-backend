import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {WRITE_ROLES} from "@/lib/programme";

const schema = z.object({group: z.enum(["regular", "legacy"]), ids: z.array(z.string().uuid()).min(1).max(200), reason: z.string().trim().min(4).max(300).default("Reordered in CMS")}).strict();
/** Reorder within ONE group; legacy/reference items always stay after regular ones. */
export async function POST(req: NextRequest) {
  try {
    const actor = await admin([...WRITE_ROLES]);
    const x = schema.parse(await req.json());
    if (new Set(x.ids).size !== x.ids.length) throw new HttpError(400, "DUPLICATE_IDS", "Each programme once.");
    await db.$transaction(async tx => {
      const found = await tx.programmeItem.findMany({where: {id: {in: x.ids}, deletedAt: null}, select: {id: true, isLegacy: true}});
      if (found.length !== x.ids.length || found.some(f => f.isLegacy !== (x.group === "legacy"))) throw new HttpError(400, "WRONG_GROUP", "Reorder regular and legacy programmes separately.");
      for (const [n, id] of x.ids.entries()) await tx.programmeItem.update({where: {id}, data: {displayOrder: (n + 1) * 10, updatedBy: actor.id}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "PROGRAMME_REORDERED", resourceType: "ProgrammeItem", resourceId: x.group, afterState: {ids: x.ids, reason: x.reason}}});
    });
    return NextResponse.json({ok: true}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
