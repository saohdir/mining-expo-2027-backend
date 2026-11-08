-- IMDX 2027 PRD v1.4 — new immutable booth quotation revisions.
-- IMPORTANT: apply against an approved, backed-up UAT PostgreSQL first.
-- This project was initially provisioned with Prisma db push. Reconcile the
-- migration baseline before using prisma migrate deploy in production.
BEGIN;

CREATE TABLE "BoothOffer" (
    "id" TEXT NOT NULL,
    "boothRequestId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "floorplanVersionNo" INTEGER NOT NULL,
    "offeredUnitIds" JSONB NOT NULL,
    "offeredUnits" JSONB NOT NULL,
    "offeredAreaSqm" DECIMAL(10,1) NOT NULL,
    "quotedPriceMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "notes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "offeredBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BoothOffer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BoothOffer_boothRequestId_fkey" FOREIGN KEY ("boothRequestId")
      REFERENCES "BoothRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BoothOffer_quotedPriceMinor_check" CHECK ("quotedPriceMinor" > 0),
    CONSTRAINT "BoothOffer_revision_check" CHECK ("revision" > 0)
);
CREATE UNIQUE INDEX "BoothOffer_boothRequestId_revision_key"
  ON "BoothOffer"("boothRequestId","revision");
CREATE INDEX "BoothOffer_boothRequestId_createdAt_idx"
  ON "BoothOffer"("boothRequestId","createdAt");

-- Defensive invariant against stale or manually changed status fields:
-- a physical booth unit can have at most one active assignment.
-- If historic duplicate active assignments exist, this index will fail to
-- create and those must be reconciled by Operations BEFORE applying the migration.
CREATE UNIQUE INDEX "BoothAssignment_one_active_per_unit"
  ON "BoothAssignment"("boothUnitId") WHERE "active" = TRUE;

COMMIT;
