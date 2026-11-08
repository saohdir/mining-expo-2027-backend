-- IMDX PRD v1.4 Slice B — account security (FR-115/116, AT-061/086).
-- Incremental after 20261109030000_floorplan_editor. Additive only.
BEGIN;
ALTER TABLE "OtpChallenge"
  ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'LOGIN',
  ADD COLUMN "newDestination" TEXT,
  ADD COLUMN "ipHash" TEXT;
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_purpose_check" CHECK ("purpose" IN ('LOGIN','REGISTER','CONTACT_CHANGE'));
CREATE INDEX "OtpChallenge_ipHash_createdAt_idx" ON "OtpChallenge"("ipHash","createdAt");
COMMIT;
