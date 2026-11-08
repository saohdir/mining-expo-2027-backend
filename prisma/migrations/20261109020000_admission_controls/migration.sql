-- IMDX PRD v1.4 Slice G — admission controls (FR-081/085/086/137, AT-076/077).
-- Incremental after 20261109010000_finance_controls. Additive only.
-- NOTE: after this migration CHECKIN_STAFF can scan only at gates assigned in CMS.
BEGIN;
ALTER TABLE "EventPass" ADD COLUMN "revokedAt" TIMESTAMP(3), ADD COLUMN "revokeReason" TEXT, ADD COLUMN "replacedById" TEXT, ADD COLUMN "shortCodeHash" TEXT;
CREATE UNIQUE INDEX "EventPass_shortCodeHash_key" ON "EventPass"("shortCodeHash");
ALTER TABLE "PassScan" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'CAMERA';
ALTER TABLE "PassScan" ADD CONSTRAINT "PassScan_method_check" CHECK ("method" IN ('CAMERA','MANUAL'));
CREATE INDEX "PassScan_scannedBy_createdAt_idx" ON "PassScan"("scannedBy","createdAt");
CREATE TABLE "Gate" (
  "id" TEXT NOT NULL, "eventId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "zones" TEXT[], "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Gate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Gate_eventId_code_key" ON "Gate"("eventId","code");
CREATE TABLE "StaffGateAssignment" (
  "id" TEXT NOT NULL, "adminId" TEXT NOT NULL, "gateId" TEXT NOT NULL, "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffGateAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffGateAssignment_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StaffGateAssignment_adminId_gateId_key" ON "StaffGateAssignment"("adminId","gateId");
CREATE TABLE "AdmissionPolicy" (
  "id" TEXT NOT NULL, "eventId" TEXT NOT NULL, "zone" TEXT NOT NULL, "reentry" TEXT NOT NULL DEFAULT 'ONCE_PER_DAY',
  "updatedBy" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdmissionPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdmissionPolicy_reentry_check" CHECK ("reentry" IN ('ONCE_PER_DAY','ALLOW_REENTRY'))
);
CREATE UNIQUE INDEX "AdmissionPolicy_eventId_zone_key" ON "AdmissionPolicy"("eventId","zone");
COMMIT;
