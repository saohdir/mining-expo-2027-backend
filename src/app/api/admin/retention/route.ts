import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {applyRetention, CATEGORIES, loadPolicy, policySchema, RETENTION_KEY, RETENTION_LAST_RUN_KEY} from "@/lib/retention";

const H = {headers: {"Cache-Control": "private,no-store"}};
/** FR-150: retention policy, dry-run preview of what would be purged now, last scheduled run. */
export async function GET() {
  try {
    await admin(["SUPER_ADMIN"]);
    const policy = await loadPolicy(db);
    const last = await db.appSetting.findUnique({where: {key: RETENTION_LAST_RUN_KEY}});
    return NextResponse.json({categories: CATEGORIES, policy, preview: policy ? await applyRetention(db, policy, {dryRun: true}) : null, lastRun: last?.value ?? null}, H);
  } catch (e) { return failure(e); }
}
const put = z.object({policy: policySchema.nullable(), reason: z.string().min(8).max(500)}).strict();
export async function PUT(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN"]);
    const x = put.parse(await req.json());
    const before = await db.appSetting.findUnique({where: {key: RETENTION_KEY}});
    await db.$transaction(async tx => {
      if (x.policy) { const value = JSON.stringify(x.policy); await tx.appSetting.upsert({where: {key: RETENTION_KEY}, update: {value, updatedBy: actor.id}, create: {key: RETENTION_KEY, value, updatedBy: actor.id}}); }
      else await tx.appSetting.deleteMany({where: {key: RETENTION_KEY}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "RETENTION_POLICY_CHANGED", resourceType: "AppSetting", resourceId: RETENTION_KEY, beforeState: before ? JSON.parse(before.value) : undefined, afterState: {policy: x.policy, reason: x.reason}}});
    });
    return NextResponse.json({ok: true}, H);
  } catch (e) { return failure(e); }
}
const run = z.object({confirm: z.literal("PURGE"), reason: z.string().min(8).max(500)}).strict();
/** Manual run (same rules as the daily worker step); requires typing PURGE. Audited with counts. */
export async function POST(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN"]);
    const x = run.parse(await req.json());
    const policy = await loadPolicy(db);
    if (!policy) throw new HttpError(409, "NO_POLICY", "No approved retention policy is saved.");
    const counts = await applyRetention(db, policy, {dryRun: false});
    await db.auditLog.create({data: {adminId: actor.id, action: "RETENTION_PURGE_RUN", resourceType: "AppSetting", resourceId: RETENTION_KEY, afterState: {trigger: "manual", counts, reason: x.reason}}});
    return NextResponse.json({counts}, H);
  } catch (e) { return failure(e); }
}
