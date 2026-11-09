BEGIN;
-- Event Highlights gallery: years (buttons on /highlights/) and compressed photo/video items. Additive only.
CREATE TABLE "GalleryYear" (
  "year" INTEGER NOT NULL,
  "label" TEXT,
  "published" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GalleryYear_pkey" PRIMARY KEY ("year")
);
CREATE TABLE "GalleryItem" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "processing" TEXT NOT NULL DEFAULT 'PENDING',
  "processingError" TEXT,
  "fileKey" TEXT,
  "thumbKey" TEXT,
  "originalKey" TEXT,
  "originalName" TEXT,
  "originalBytes" INTEGER NOT NULL,
  "bytes" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "durationSec" DOUBLE PRECISION,
  "titleEn" TEXT,
  "titleZh" TEXT,
  "captionEn" TEXT,
  "captionZh" TEXT,
  "altEn" TEXT,
  "altZh" TEXT,
  "rightsStatus" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "GalleryItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GalleryItem_year_status_sortOrder_idx" ON "GalleryItem"("year", "status", "sortOrder");
CREATE INDEX "GalleryItem_processing_idx" ON "GalleryItem"("processing");
ALTER TABLE "GalleryItem" ADD CONSTRAINT "GalleryItem_year_fkey" FOREIGN KEY ("year") REFERENCES "GalleryYear"("year") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
