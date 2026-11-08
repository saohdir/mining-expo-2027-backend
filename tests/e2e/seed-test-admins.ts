// Creates one admin per role with KNOWN test passwords. Local disposable DB only.
import {PrismaClient, AdminRole} from "@prisma/client";
import {hashPassword} from "../../src/lib/security";
const url = process.env.DATABASE_URL || "";
if (!/@localhost[:/]|@127\.0\.0\.1[:/]/.test(url) || process.env.E2E_ALLOW_TEST_ADMINS !== "true")
  throw new Error("Refusing: test admins are only for a local disposable database (set E2E_ALLOW_TEST_ADMINS=true).");
const db = new PrismaClient();
(async () => {
  for (const role of Object.values(AdminRole)) {
    const email = role.toLowerCase() + "@test.local", passwordHash = hashPassword("local-test-password-" + role);
    await db.adminUser.upsert({where: {email}, update: {role, active: true, passwordHash}, create: {email, role, passwordHash}});
  }
  console.log("Seeded test admins for", Object.values(AdminRole).length, "roles");
  await db.$disconnect();
})();
