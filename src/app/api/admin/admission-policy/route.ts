import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";

const schema = z.object({eventCode: z.string().default("IMDX-2027"), zone: z.string().regex(/^[A-Z0-9_]{2,40}$/), reentry: z.enum(["ONCE_PER_DAY", "ALLOW_REENTRY"]), reason: z.string().min(8).max(300)}).strict();
/** FR-085: per-zone re-entry policy. Default (no row) is ONCE_PER_DAY (documented release default, D-09). */
export async function PUT(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const x = schema.parse(await req.json());
    const event = await db.event.findUnique({where: {code: x.eventCode}});
    if (!event) throw new HttpError(404, "NOT_FOUND", "Event not found.");
    const p = await db.$transaction(async tx => {
      const before = await tx.admissionPolicy.findUnique({where: {eventId_zone: {eventId: event.id, zone: x.zone}}});
      const row = await tx.admissionPolicy.upsert({where: {eventId_zone: {eventId: event.id, zone: x.zone}}, update: {reentry: x.reentry, updatedBy: actor.id}, create: {eventId: event.id, zone: x.zone, reentry: x.reentry, updatedBy: actor.id}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "ADMISSION_POLICY_SET", resourceType: "AdmissionPolicy", resourceId: row.id, beforeState: {reentry: before?.reentry ?? "ONCE_PER_DAY"}, afterState: {zone: x.zone, reentry: x.reentry, reason: x.reason}}});
      return row;
    });
    return NextResponse.json({policy: p}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
