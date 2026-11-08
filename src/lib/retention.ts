import {z} from "zod";
import type {PrismaClient} from "@prisma/client";
import {removePrivate} from "./private-files";

/** FR-150: retention / purge rules. NOTHING is purged until a Super Admin saves a policy approved under D-13/D-10.
 * Each category has a hard minimum so a typo cannot wipe recent operational data. The audit log, invoices, ledger,
 * admissions, enrollments and accounts are never purged here (legal/financial records — separate decision). */
export const RETENTION_KEY = "retention.policy";
export const RETENTION_LAST_RUN_KEY = "retention.lastRun";
export const CATEGORIES = {
  AUTH_ARTIFACTS: {min: 7, label: "Expired/revoked sessions, used/expired sign-in tokens, OTP challenges, login attempts"},
  CLOSED_INVITATIONS: {min: 30, label: "Accepted/revoked/expired invitations (token hashes, names, emails)"},
  REJECTED_SCANS: {min: 30, label: "Rejected scan attempts (admissions are kept)"},
  CLOSED_LEADS: {min: 90, label: "Anonymise website enquiries that are CLOSED (contact fields and message)"},
  PAYMENT_PROOF_FILES: {min: 180, label: "Delete uploaded transfer-proof files of verified/rejected transfers (record and amount are kept)"},
  EXPORT_JOB_RECORDS: {min: 30, label: "Expired/failed export job records (files already auto-expire)"}
} as const;
export type Category = keyof typeof CATEGORIES;
const days = z.number().int().max(3650);
export const policySchema = z.object({
  rules: z.object(Object.fromEntries(Object.keys(CATEGORIES).map(k => [k, days.min(CATEGORIES[k as Category].min).optional()])) as Record<Category, z.ZodOptional<z.ZodNumber>>).strict(),
  approvedBy: z.string().min(2).max(120), approvedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
}).strict();
export type Policy = z.infer<typeof policySchema>;
const cutoff = (d: number, now: Date) => new Date(now.getTime() - d * 86400000);

/** Counts (dry run) or purges per configured category. Returns {category: count}. */
export async function applyRetention(db: PrismaClient, policy: Policy, opts: {dryRun: boolean; now?: Date}) {
  const now = opts.now ?? new Date(), out: Partial<Record<Category, number>> = {};
  const r = policy.rules as Partial<Record<Category, number>>;
  if (r.AUTH_ARTIFACTS) {
    const c = cutoff(r.AUTH_ARTIFACTS, now);
    const w = {
      cs: {OR: [{expiresAt: {lt: c}}, {revokedAt: {lt: c}}]}, as: {expiresAt: {lt: c}},
      tok: {OR: [{expiresAt: {lt: c}}, {usedAt: {lt: c}}]}, otp: {expiresAt: {lt: c}}, la: {createdAt: {lt: c}}
    };
    if (opts.dryRun) out.AUTH_ARTIFACTS = (await Promise.all([db.customerSession.count({where: w.cs}), db.adminSession.count({where: w.as}), db.authToken.count({where: w.tok}), db.otpChallenge.count({where: w.otp}), db.loginAttempt.count({where: w.la})])).reduce((a, b) => a + b, 0);
    else out.AUTH_ARTIFACTS = (await db.$transaction([db.customerSession.deleteMany({where: w.cs}), db.adminSession.deleteMany({where: w.as}), db.authToken.deleteMany({where: w.tok}), db.otpChallenge.deleteMany({where: w.otp}), db.loginAttempt.deleteMany({where: w.la})])).reduce((a, b) => a + b.count, 0);
  }
  if (r.CLOSED_INVITATIONS) {
    const where = {status: {in: ["ACCEPTED", "REVOKED", "EXPIRED"]}, OR: [{respondedAt: {lt: cutoff(r.CLOSED_INVITATIONS, now)}}, {respondedAt: null, expiresAt: {lt: cutoff(r.CLOSED_INVITATIONS, now)}}]};
    out.CLOSED_INVITATIONS = opts.dryRun ? await db.invitation.count({where}) : (await db.invitation.deleteMany({where})).count;
  }
  if (r.REJECTED_SCANS) {
    const where = {result: {not: "VALID_ACCEPTED" as const}, createdAt: {lt: cutoff(r.REJECTED_SCANS, now)}};
    out.REJECTED_SCANS = opts.dryRun ? await db.passScan.count({where}) : (await db.passScan.deleteMany({where})).count;
  }
  if (r.CLOSED_LEADS) {
    const where = {status: "CLOSED", updatedAt: {lt: cutoff(r.CLOSED_LEADS, now)}, NOT: {email: {endsWith: "@anonymised.invalid"}}};
    if (opts.dryRun) out.CLOSED_LEADS = await db.lead.count({where});
    else {
      const rows = await db.lead.findMany({where, select: {id: true}, take: 5000});
      for (const l of rows) await db.lead.update({where: {id: l.id}, data: {name: "Anonymised", email: l.id + "@anonymised.invalid", phone: null, company: null, message: "[removed under retention policy]", ipHash: null}});
      out.CLOSED_LEADS = rows.length;
    }
  }
  if (r.PAYMENT_PROOF_FILES) {
    const where = {proofUrl: {not: null}, status: {in: ["VERIFIED" as const, "REJECTED" as const]}, createdAt: {lt: cutoff(r.PAYMENT_PROOF_FILES, now)}};
    if (opts.dryRun) out.PAYMENT_PROOF_FILES = await db.manualTransfer.count({where});
    else {
      const rows = await db.manualTransfer.findMany({where, select: {id: true, proofUrl: true}, take: 2000});
      for (const t of rows) { await removePrivate(t.proofUrl!); await db.manualTransfer.update({where: {id: t.id}, data: {proofUrl: null}}); }
      out.PAYMENT_PROOF_FILES = rows.length;
    }
  }
  if (r.EXPORT_JOB_RECORDS) {
    const where = {state: {in: ["EXPIRED", "FAILED"]}, createdAt: {lt: cutoff(r.EXPORT_JOB_RECORDS, now)}};
    out.EXPORT_JOB_RECORDS = opts.dryRun ? await db.exportJob.count({where}) : (await db.exportJob.deleteMany({where})).count;
  }
  return out;
}

export async function loadPolicy(db: PrismaClient) {
  const s = await db.appSetting.findUnique({where: {key: RETENTION_KEY}});
  return s ? policySchema.parse(JSON.parse(s.value)) : null;
}

/** Worker step: at most once per 24 h, only with a saved policy; each run is audited with counts. */
export async function scheduledRetention(db: PrismaClient, now = new Date()) {
  const policy = await loadPolicy(db); if (!policy) return null;
  const last = await db.appSetting.findUnique({where: {key: RETENTION_LAST_RUN_KEY}});
  if (last && now.getTime() - Date.parse(last.value) < 86400000) return null;
  const counts = await applyRetention(db, policy, {dryRun: false, now});
  await db.appSetting.upsert({where: {key: RETENTION_LAST_RUN_KEY}, update: {value: now.toISOString(), updatedBy: "worker"}, create: {key: RETENTION_LAST_RUN_KEY, value: now.toISOString(), updatedBy: "worker"}});
  await db.auditLog.create({data: {action: "RETENTION_PURGE_RUN", resourceType: "AppSetting", resourceId: RETENTION_KEY, afterState: {trigger: "schedule", counts}}});
  return counts;
}
