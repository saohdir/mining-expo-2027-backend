-- IMDX PRD v1.4 — engagement add-ons (FR-016 gallery, FR-152 notification preference, FR-155 waitlist). Additive.
BEGIN;
ALTER TABLE "CustomerProfile" ADD COLUMN "notifyChannel" TEXT NOT NULL DEFAULT 'EMAIL';
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_notifyChannel_check" CHECK ("notifyChannel" IN ('EMAIL','WHATSAPP'));
ALTER TABLE "ContentItem" DROP CONSTRAINT "ContentItem_kind_check";
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_kind_check" CHECK ("kind" IN ('PARTNER','ORGANIZER','DOWNLOAD','NEWS','SCOPE','CONTACT','PAGE_BLOCK','GALLERY'));
CREATE TABLE "WaitlistEntry" (
  "id" TEXT NOT NULL, "conferenceId" TEXT NOT NULL, "accountId" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'WAITING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "releasedAt" TIMESTAMP(3), "releasedBy" TEXT, "enrollmentId" TEXT,
  CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WaitlistEntry_status_check" CHECK ("status" IN ('WAITING','OFFERED','CANCELLED'))
);
CREATE UNIQUE INDEX "WaitlistEntry_conferenceId_accountId_key" ON "WaitlistEntry"("conferenceId","accountId");
CREATE INDEX "WaitlistEntry_conferenceId_status_createdAt_idx" ON "WaitlistEntry"("conferenceId","status","createdAt");
COMMIT;
