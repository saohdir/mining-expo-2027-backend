-- IMDX PRD v1.4 P1/P2 extensions (FR-157 session zones, FR-156/059 invites, FR-159 tariffs, FR-041 events). Additive.
BEGIN;
ALTER TABLE "Conference" ADD COLUMN "zoneCode" TEXT;
CREATE UNIQUE INDEX "Conference_eventId_zoneCode_key" ON "Conference"("eventId","zoneCode") WHERE "zoneCode" IS NOT NULL;
ALTER TABLE "Enrollment" ADD COLUMN "groupId" TEXT;
CREATE INDEX "Enrollment_groupId_idx" ON "Enrollment"("groupId");
CREATE TABLE "Invitation" (
  "id" TEXT NOT NULL, "kind" TEXT NOT NULL, "inviterAccountId" TEXT NOT NULL, "boothRequestId" TEXT, "enrollmentId" TEXT, "groupId" TEXT,
  "email" TEXT NOT NULL, "fullName" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'INVITED', "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAccountId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "respondedAt" TIMESTAMP(3),
  CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Invitation_kind_check" CHECK ("kind" IN ('EXHIBITOR_STAFF','GROUP_DELEGATE')),
  CONSTRAINT "Invitation_status_check" CHECK ("status" IN ('INVITED','ACCEPTED','REVOKED','EXPIRED'))
);
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
CREATE INDEX "Invitation_boothRequestId_status_idx" ON "Invitation"("boothRequestId","status");
CREATE INDEX "Invitation_groupId_idx" ON "Invitation"("groupId");
COMMIT;
