import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";
import {policies} from "@/lib/policy";
import {ESTIMATOR_KEY, tariffSchema} from "@/lib/fee-estimator";

/** FR-159: organizer-approved tariff table for the public estimator (Super Admin edits, audited with before/after). */
export async function GET() {
  try {
    await admin(["SUPER_ADMIN", "SALES", "FINANCE"]);
    const s = await db.appSetting.findUnique({where: {key: ESTIMATOR_KEY}});
    return NextResponse.json({enabled: policies.feeEstimator(), tariffs: s ? JSON.parse(s.value) : null, updatedAt: s?.updatedAt ?? null}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
const body = z.object({tariffs: tariffSchema.nullable(), reason: z.string().min(8).max(500)}).strict();
export async function PUT(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN"]);
    const x = body.parse(await req.json());
    const before = await db.appSetting.findUnique({where: {key: ESTIMATOR_KEY}});
    await db.$transaction(async tx => {
      if (x.tariffs) { const value = JSON.stringify(x.tariffs); await tx.appSetting.upsert({where: {key: ESTIMATOR_KEY}, update: {value, updatedBy: actor.id}, create: {key: ESTIMATOR_KEY, value, updatedBy: actor.id}}); }
      else await tx.appSetting.deleteMany({where: {key: ESTIMATOR_KEY}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "ESTIMATOR_TARIFFS_CHANGED", resourceType: "AppSetting", resourceId: ESTIMATOR_KEY, beforeState: before ? JSON.parse(before.value) : undefined, afterState: {tariffs: x.tariffs, reason: x.reason}}});
    });
    return NextResponse.json({ok: true}, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
