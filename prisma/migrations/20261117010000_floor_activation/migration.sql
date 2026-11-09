BEGIN;
-- Several floors can be live at once; each can be switched active/inactive (customers only see active ones).
ALTER TABLE "Floorplan" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
DROP INDEX IF EXISTS "Floorplan_one_published_per_event";
-- A draft created as a new version of a live floor replaces only that floor when published.
ALTER TABLE "Floorplan" ADD COLUMN "replacesId" TEXT;
CREATE INDEX "Floorplan_replacesId_idx" ON "Floorplan"("replacesId");
-- Existing drafts keep today's behaviour: they replace the event's current published map.
UPDATE "Floorplan" d SET "replacesId" = (
  SELECT p."id" FROM "Floorplan" p WHERE p."eventId" = d."eventId" AND p."status" = 'PUBLISHED' ORDER BY p."publishedAt" DESC NULLS LAST LIMIT 1)
WHERE d."status" = 'DRAFT';
-- Booked by (manual, for deals made outside the portal) and split booths.
ALTER TABLE "BoothUnit" ADD COLUMN "occupantCompany" TEXT;
ALTER TABLE "BoothUnit" ADD COLUMN "occupantContact" TEXT;
ALTER TABLE "BoothUnit" ADD COLUMN "splitFromId" TEXT;
COMMIT;
