/**
 * UAT helper: creates ready-to-use, email-verified customer accounts with a password (CR-AUTH-01),
 * so testers do not have to go through registration + email OTP by hand.
 *
 *   docker compose --env-file .env.uat -f deploy/compose.uat.yml exec app \
 *     npx tsx scripts/create-test-customers.ts --confirm --count 5 [--prefix uat-customer] [--domain imdx-uat.test]
 *
 * - Refuses to run when APP_STAGE=production.
 * - Idempotent: existing emails are skipped (their password is NOT changed).
 * - Passwords are random and written ONLY to a private file (mode 600, outside the repository);
 *   the console shows emails and the file path, never a password. Delete the file after handing it over.
 * - Writes one audit log entry (TEST_CUSTOMERS_CREATED) without passwords.
 */
import {randomBytes} from "node:crypto";
import {writeFileSync} from "node:fs";
import path from "node:path";
import os from "node:os";
import {PrismaClient} from "@prisma/client";
import {hashCustomerPassword, passwordProblems} from "../src/lib/customer-auth";

const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : fallback; };
const db = new PrismaClient();

/** 16 chars from an unambiguous alphabet, always with letters and digits (meets the password policy). */
function newPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", digits = "23456789", all = letters + digits;
  for (;;) {
    const b = randomBytes(16), pw = [...b].map(x => all[x % all.length]).join("");
    if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) return pw;
  }
}

async function main() {
  if (process.env.APP_STAGE === "production") throw new Error("Refusing to create test customers in production.");
  if (!process.argv.includes("--confirm")) throw new Error("Add --confirm to create accounts (this writes to the database in DATABASE_URL).");
  const count = Number(arg("count", "5"));
  if (!Number.isInteger(count) || count < 1 || count > 50) throw new Error("--count must be 1..50");
  const prefix = (arg("prefix", "uat-customer") || "").toLowerCase(), domain = (arg("domain", "imdx-uat.test") || "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]{1,30}$/.test(prefix) || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error("Invalid --prefix or --domain");

  const rows: string[] = [], created: string[] = [], skipped: string[] = [];
  for (let i = 1; i <= count; i++) {
    const email = `${prefix}${String(i).padStart(2, "0")}@${domain}`;
    if (await db.customerAccount.findUnique({where: {email}})) { skipped.push(email); continue; }
    const password = newPassword();
    if (passwordProblems(password, email).length) throw new Error("Generated password failed policy");
    const now = new Date();
    await db.customerAccount.create({data: {email, status: "ACTIVE", verifiedEmailAt: now, passwordHash: await hashCustomerPassword(password), passwordSetAt: now,
      profile: {create: {fullName: `UAT Customer ${String(i).padStart(2, "0")}`, organization: "UAT Test Company", jobTitle: "Tester", country: "Indonesia", consentVersion: "uat-test-account", consentAt: now}}}});
    rows.push(`${email}\t${password}`); created.push(email);
  }
  let file = "";
  if (rows.length) {
    file = path.join(arg("out-dir", os.tmpdir())!, `imdx-test-customers-${Date.now()}.txt`);
    writeFileSync(file, "# IMDX UAT test customer accounts — delete after handing over\nemail\tpassword\n" + rows.join("\n") + "\n", {mode: 0o600});
  }
  await db.auditLog.create({data: {action: "TEST_CUSTOMERS_CREATED", resourceType: "CustomerAccount", resourceId: prefix + "@" + domain, afterState: {created, skipped}}});
  console.log(`Created ${created.length}, skipped ${skipped.length} existing.`);
  for (const e of created) console.log("  + " + e);
  for (const e of skipped) console.log("  = " + e + " (exists, unchanged)");
  if (file) console.log("Passwords written to " + file + " (mode 600). Copy them out, then delete the file.");
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
