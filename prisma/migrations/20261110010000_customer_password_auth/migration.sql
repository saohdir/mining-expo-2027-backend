-- IMDX PRD v1.4 Change Request CR-AUTH-01 — customer email+password login, OTP only for registration.
-- Additive. Existing customers keep all data; they have NO password (passwordHash NULL) and must use the
-- one-time "set up password" email link before they can sign in. No default passwords are created.
BEGIN;
ALTER TABLE "CustomerAccount"
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "passwordSetAt" TIMESTAMP(3),
  ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil" TIMESTAMP(3),
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "termsVersion" TEXT,
  ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "OtpChallenge" DROP CONSTRAINT "OtpChallenge_purpose_check";
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_purpose_check" CHECK ("purpose" IN ('LOGIN','REGISTER','CONTACT_CHANGE'));
CREATE TABLE "AuthToken" (
  "id" TEXT NOT NULL, "accountId" TEXT NOT NULL, "purpose" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "ipHash" TEXT,
  CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthToken_purpose_check" CHECK ("purpose" IN ('REGISTER','RESET','SETUP'))
);
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");
CREATE INDEX "AuthToken_accountId_purpose_createdAt_idx" ON "AuthToken"("accountId","purpose","createdAt");
CREATE TABLE "LoginAttempt" (
  "id" TEXT NOT NULL, "accountId" TEXT, "emailHash" TEXT NOT NULL, "ipHash" TEXT NOT NULL, "success" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LoginAttempt_ipHash_createdAt_idx" ON "LoginAttempt"("ipHash","createdAt");
CREATE INDEX "LoginAttempt_emailHash_createdAt_idx" ON "LoginAttempt"("emailHash","createdAt");
COMMIT;
