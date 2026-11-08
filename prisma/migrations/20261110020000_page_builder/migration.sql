-- IMDX — CMS page content & layout management for public pages. Additive.
BEGIN;
CREATE TABLE "PageLayout" (
  "id" TEXT NOT NULL, "pageKey" TEXT NOT NULL, "locale" TEXT NOT NULL DEFAULT 'en', "draft" JSONB NOT NULL, "published" JSONB,
  "version" INTEGER NOT NULL DEFAULT 0, "draftUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "draftUpdatedBy" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3), "publishedBy" TEXT,
  CONSTRAINT "PageLayout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PageLayout_locale_check" CHECK ("locale" IN ('en','id'))
);
CREATE UNIQUE INDEX "PageLayout_pageKey_locale_key" ON "PageLayout"("pageKey","locale");
CREATE TABLE "PageRevision" (
  "id" TEXT NOT NULL, "pageKey" TEXT NOT NULL, "locale" TEXT NOT NULL, "version" INTEGER NOT NULL, "layout" JSONB NOT NULL,
  "reason" TEXT NOT NULL, "publishedBy" TEXT NOT NULL, "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PageRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PageRevision_pageKey_locale_version_key" ON "PageRevision"("pageKey","locale","version");
COMMIT;
