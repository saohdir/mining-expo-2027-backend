BEGIN;
-- CR-PROGRAMME: editorial programme pages with EN / 中文 translations and publish snapshots. Additive only.
CREATE TABLE "ProgrammeItem" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'CONFERENCE',
  "programmeStatus" TEXT NOT NULL DEFAULT 'TBA',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "isLegacy" BOOLEAN NOT NULL DEFAULT false,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "imageUrl" TEXT,
  "imageRightsStatus" TEXT,
  "eventDate" DATE,
  "startTime" TEXT,
  "endTime" TEXT,
  "venue" TEXT,
  "feeLabel" TEXT,
  "currency" TEXT,
  "dateConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "venueConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "feeConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "conferenceId" TEXT,
  "sourceSystem" TEXT,
  "sourceId" TEXT,
  "sourceUrl" TEXT,
  "sourceTitle" TEXT,
  "sourceFacts" JSONB,
  "editorialStatus" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  "editorialNote" TEXT,
  "publishedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" TEXT NOT NULL,
  CONSTRAINT "ProgrammeItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProgrammeItem_slug_key" ON "ProgrammeItem"("slug");
CREATE UNIQUE INDEX "ProgrammeItem_sourceSystem_sourceId_key" ON "ProgrammeItem"("sourceSystem", "sourceId");
CREATE INDEX "ProgrammeItem_status_isLegacy_displayOrder_idx" ON "ProgrammeItem"("status", "isLegacy", "displayOrder");
ALTER TABLE "ProgrammeItem" ADD CONSTRAINT "ProgrammeItem_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "Conference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ProgrammeTranslation" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "locale" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "categoryLabel" TEXT,
  "summary" TEXT NOT NULL,
  "overview" TEXT NOT NULL,
  "highlights" JSONB NOT NULL,
  "imageAlt" TEXT,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "reviewStatus" TEXT NOT NULL DEFAULT 'APPROVED',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProgrammeTranslation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProgrammeTranslation_itemId_locale_key" ON "ProgrammeTranslation"("itemId", "locale");
ALTER TABLE "ProgrammeTranslation" ADD CONSTRAINT "ProgrammeTranslation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ProgrammeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProgrammeRevision" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProgrammeRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProgrammeRevision_itemId_version_key" ON "ProgrammeRevision"("itemId", "version");
ALTER TABLE "ProgrammeRevision" ADD CONSTRAINT "ProgrammeRevision_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ProgrammeItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
