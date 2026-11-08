import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";
import {CHARGES_KEY, chargesConfigSchema} from "@/lib/invoice-charges";

/** FR-125: approved invoice taxes/fees (D-01). Super Admin edits with approval reference; audited before/after.
 * Applies to NEW drafts and revisions only — issued invoices never change. */
export async function GET() {
  try {
    await admin(["SUPER_ADMIN", "FINANCE", "SALES"]);
    const s = await db.appSetting.findUnique({where: {key: CHARGES_KEY}});
    return NextResponse.json({config: s ? JSON.parse(s.value) : null, updatedAt: s?.updatedAt ?? null}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
const body = z.object({config: chargesConfigSchema.nullable(), reason: z.string().min(8).max(500)}).strict();
export async function PUT(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN"]);
    const x = body.parse(await req.json());
    const before = await db.appSetting.findUnique({where: {key: CHARGES_KEY}});
    await db.$transaction(async tx => {
      if (x.config) { const value = JSON.stringify(x.config); await tx.appSetting.upsert({where: {key: CHARGES_KEY}, update: {value, updatedBy: actor.id}, create: {key: CHARGES_KEY, value, updatedBy: actor.id}}); }
      else await tx.appSetting.deleteMany({where: {key: CHARGES_KEY}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "INVOICE_CHARGES_CHANGED", resourceType: "AppSetting", resourceId: CHARGES_KEY, beforeState: before ? JSON.parse(before.value) : undefined, afterState: {config: x.config, reason: x.reason}}});
    });
    return NextResponse.json({ok: true}, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
