-- IMDX PRD v1.4 Slice H — CMS administration (FR-148 internal notes). Additive only.
BEGIN;
CREATE TABLE "InternalNote" (
  "id" TEXT NOT NULL, "resourceType" TEXT NOT NULL, "resourceId" TEXT NOT NULL, "body" TEXT NOT NULL, "adminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InternalNote_resourceType_check" CHECK ("resourceType" IN ('CustomerAccount','Enrollment','BoothRequest','Invoice'))
);
CREATE INDEX "InternalNote_resourceType_resourceId_createdAt_idx" ON "InternalNote"("resourceType","resourceId","createdAt");
-- Slice A — leads (FR-024/030/036) and content (FR-005/009/013/034/035/038).
CREATE TABLE "Lead" (
  "id" TEXT NOT NULL, "leadType" TEXT NOT NULL, "name" TEXT NOT NULL, "email" TEXT NOT NULL, "company" TEXT, "phone" TEXT, "message" TEXT NOT NULL,
  "consentVersion" TEXT NOT NULL, "consentAt" TIMESTAMP(3) NOT NULL, "utmSource" TEXT, "utmMedium" TEXT, "utmCampaign" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW', "ipHash" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Lead_type_check" CHECK ("leadType" IN ('CONTACT','PARTNER','SPONSOR','EXHIBITOR')),
  CONSTRAINT "Lead_status_check" CHECK ("status" IN ('NEW','CONTACTED','QUALIFIED','CLOSED'))
);
CREATE INDEX "Lead_status_createdAt_idx" ON "Lead"("status","createdAt");
CREATE INDEX "Lead_ipHash_createdAt_idx" ON "Lead"("ipHash","createdAt");
CREATE TABLE "ContentItem" (
  "id" TEXT NOT NULL, "kind" TEXT NOT NULL, "locale" TEXT NOT NULL DEFAULT 'en', "title" TEXT NOT NULL, "slug" TEXT NOT NULL, "summary" TEXT, "body" TEXT,
  "url" TEXT, "fileType" TEXT, "fileSizeBytes" INTEGER, "imageUrl" TEXT, "altText" TEXT, "rightsStatus" TEXT, "role" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT', "sortOrder" INTEGER NOT NULL DEFAULT 0, "publishedAt" TIMESTAMP(3), "updatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ContentItem_kind_check" CHECK ("kind" IN ('PARTNER','ORGANIZER','DOWNLOAD','NEWS','SCOPE','CONTACT','PAGE_BLOCK')),
  CONSTRAINT "ContentItem_locale_check" CHECK ("locale" IN ('en','id')),
  CONSTRAINT "ContentItem_status_check" CHECK ("status" IN ('DRAFT','PUBLISHED','ARCHIVED'))
);
CREATE UNIQUE INDEX "ContentItem_kind_locale_slug_key" ON "ContentItem"("kind","locale","slug");
CREATE INDEX "ContentItem_kind_locale_status_sortOrder_idx" ON "ContentItem"("kind","locale","status","sortOrder");
COMMIT;
