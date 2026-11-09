/**
 * Applies the owner decisions that were delegated to the development team (9 Nov 2026), through the same audited settings
 * the CMS uses. Values and reasons: docs/OWNER_DECISIONS.md. Re-running is safe (values are replaced, every change audited).
 *
 *   docker compose --env-file .env.uat -f deploy/compose.uat.yml exec app npx tsx scripts/apply-owner-decisions.ts --confirm
 *
 * Deliberately NOT set here (facts only the organizer can provide): bank account (APPROVED_BANK_*), prices/packages/tariffs (D-02),
 * partner logos and downloads, WhatsApp/SMS provider credentials (D-04/D-05).
 */
import {Prisma, PrismaClient} from "@prisma/client";
import {policySchema, RETENTION_KEY} from "../src/lib/retention";
import {CHARGES_KEY, chargesConfigSchema} from "../src/lib/invoice-charges";

const db = new PrismaClient();
const APPROVED = {approvedBy: "Product Owner (delegated decision, 9 Nov 2026)", approvedAt: "2026-11-09"};
const BY = "system:owner-decisions";

async function setting(key: string, value: unknown, action: string) {
  const before = await db.appSetting.findUnique({where: {key}});
  const v = JSON.stringify(value);
  await db.$transaction([
    db.appSetting.upsert({where: {key}, update: {value: v, updatedBy: BY}, create: {key, value: v, updatedBy: BY}}),
    db.auditLog.create({data: {action, resourceType: "AppSetting", resourceId: key, beforeState: before ? JSON.parse(before.value) : undefined, afterState: {value: value as Prisma.InputJsonValue, source: BY}}})
  ]);
}

async function main() {
  if (!process.argv.includes("--confirm")) throw new Error("Add --confirm (writes settings in DATABASE_URL).");
  // D-13 / D-10: retention. Invoices, payments and transfer proofs are kept 10 years (Indonesian tax/accounting records) → not purged.
  const retention = policySchema.parse({rules: {AUTH_ARTIFACTS: 30, CLOSED_INVITATIONS: 90, REJECTED_SCANS: 180, CLOSED_LEADS: 730, EXPORT_JOB_RECORDS: 90}, ...APPROVED});
  await setting(RETENTION_KEY, retention, "RETENTION_POLICY_CHANGED");
  console.log("D-13 retention policy saved (daily worker run).");
  // D-01: Indonesian VAT (PPN) shown as its own line on booth and conference invoices: 12% rate on DPP 11/12 = 11% effective.
  const charges = chargesConfigSchema.parse({charges: [{code: "PPN", label: "PPN (VAT) 12% × DPP 11/12", kind: "TAX", rateBps: 1100, appliesTo: ["BOOTH", "CONFERENCE"]}], ...APPROVED});
  await setting(CHARGES_KEY, charges, "INVOICE_CHARGES_CHANGED");
  console.log("D-01 invoice tax line saved (applies to new drafts only).");
  // D-09: re-entry default — one admission per person, zone and day.
  for (const ev of await db.event.findMany({select: {id: true, code: true}})) {
    for (const zone of ["EXPO_ENTRY", "CONFERENCE"]) {
      await db.admissionPolicy.upsert({where: {eventId_zone: {eventId: ev.id, zone}}, update: {reentry: "ONCE_PER_DAY", updatedBy: BY}, create: {eventId: ev.id, zone, reentry: "ONCE_PER_DAY", updatedBy: BY}});
    }
    await db.auditLog.create({data: {action: "ADMISSION_POLICY_CHANGED", resourceType: "Event", resourceId: ev.id, afterState: {zones: ["EXPO_ENTRY", "CONFERENCE"], reentry: "ONCE_PER_DAY", source: BY}}});
    console.log(`D-09 re-entry ONCE_PER_DAY for ${ev.code}.`);
  }
  console.log("Done. Environment decisions (D-11 maker-checker, UAT feature flags) are applied in .env.uat — see docs/OWNER_DECISIONS.md.");
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
