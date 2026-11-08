-- Incremental after 20261108072000_booth_offers (must exist).
-- Apply only after backup, in maintenance window, see docs/FLOORPLAN_ROLLBACK_HOLDS.md
BEGIN;
CREATE TABLE "BoothHold" (
  "id" TEXT NOT NULL,
  "boothUnitId" TEXT NOT NULL,
  "boothRequestId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "endedBy" TEXT,
  "endReason" TEXT,
  CONSTRAINT "BoothHold_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BoothHold_boothUnitId_fkey" FOREIGN KEY ("boothUnitId") REFERENCES "BoothUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BoothHold_boothRequestId_fkey" FOREIGN KEY ("boothRequestId") REFERENCES "BoothRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BoothHold_status_check" CHECK ("status" IN ('ACTIVE','RELEASED','EXPIRED')),
  CONSTRAINT "BoothHold_expiry_check" CHECK ("expiresAt" > "createdAt")
);
CREATE INDEX "BoothHold_status_expiresAt_idx" ON "BoothHold"("status", "expiresAt");
CREATE INDEX "BoothHold_boothRequestId_status_idx" ON "BoothHold"("boothRequestId", "status");
CREATE UNIQUE INDEX "BoothHold_one_active_per_unit" ON "BoothHold"("boothUnitId") WHERE "status" = 'ACTIVE';
-- Database-level backstop: no two published floorplans for one event edition.
-- Review existing duplicates BEFORE running this migration.
CREATE UNIQUE INDEX "Floorplan_one_published_per_event"
  ON "Floorplan"("eventId") WHERE "status" = 'PUBLISHED';
COMMIT;
