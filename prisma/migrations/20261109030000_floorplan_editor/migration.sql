-- IMDX PRD v1.4 Slice E — floorplan editor completeness (FR-091/092/093/094/097/098/101/111).
-- Incremental after 20261109020000_admission_controls. Additive only.
BEGIN;
ALTER TABLE "Floorplan" ADD COLUMN "backgroundAlt" TEXT, ADD COLUMN "backgroundRights" TEXT;
CREATE TABLE "BoothCategory" (
  "id" TEXT NOT NULL, "eventId" TEXT NOT NULL, "name" TEXT NOT NULL, "colorHex" TEXT NOT NULL,
  "pattern" TEXT NOT NULL DEFAULT 'SOLID', "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BoothCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BoothCategory_color_check" CHECK ("colorHex" ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT "BoothCategory_pattern_check" CHECK ("pattern" IN ('SOLID','HATCH','DOTS','CROSS'))
);
CREATE UNIQUE INDEX "BoothCategory_eventId_name_key" ON "BoothCategory"("eventId","name");
ALTER TABLE "BoothUnit"
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "lengthM" DECIMAL(10,1),
  ADD COLUMN "widthM" DECIMAL(10,1),
  ADD COLUMN "dimensionLabel" TEXT,
  ADD COLUMN "rotation" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "internalNotes" TEXT,
  ADD COLUMN "placed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "BoothUnit" ADD CONSTRAINT "BoothUnit_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BoothCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BoothUnit" ADD CONSTRAINT "BoothUnit_rotation_check" CHECK ("rotation" IN (0,90,180,270));
ALTER TABLE "BoothRequest" ADD COLUMN "originalFloorplanId" TEXT;
-- FR-092 seed examples (editable): purple, pink, blue for every existing event.
INSERT INTO "BoothCategory" ("id","eventId","name","colorHex","pattern","sortOrder")
SELECT gen_random_uuid()::text, e."id", c.name, c.color, c.pattern, c.ord
FROM "Event" e CROSS JOIN (VALUES ('Standard','#6B3FA0','SOLID',1),('Premium','#D9468F','HATCH',2),('Raw space','#2F6FD6','DOTS',3)) AS c(name,color,pattern,ord)
ON CONFLICT ("eventId","name") DO NOTHING;
COMMIT;
