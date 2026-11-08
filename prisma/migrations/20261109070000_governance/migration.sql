-- IMDX PRD v1.4 — governance (FR-115 runtime OTP toggles, FR-125 invoice revisions, FR-150 data requests). Additive.
BEGIN;
ALTER TABLE "Invoice" ADD COLUMN "revisionOfId" TEXT;
CREATE TABLE "AppSetting" ("key" TEXT NOT NULL, "value" TEXT NOT NULL, "updatedBy" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key"));
CREATE TABLE "DataRequest" (
  "id" TEXT NOT NULL, "accountId" TEXT NOT NULL, "kind" TEXT NOT NULL, "details" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "resolvedAt" TIMESTAMP(3), "resolvedBy" TEXT,
  CONSTRAINT "DataRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DataRequest_kind_check" CHECK ("kind" IN ('ACCESS','CORRECTION','DELETION','CONSENT_WITHDRAWAL')),
  CONSTRAINT "DataRequest_status_check" CHECK ("status" IN ('RECEIVED','IN_PROGRESS','COMPLETED','REJECTED'))
);
CREATE INDEX "DataRequest_status_createdAt_idx" ON "DataRequest"("status","createdAt");
COMMIT;
