-- CR-LANG-01: allow Simplified Chinese ("zh") content and page layouts. Existing rows are unchanged ("id" stays valid).
BEGIN;
ALTER TABLE "ContentItem" DROP CONSTRAINT "ContentItem_locale_check";
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_locale_check" CHECK ("locale" IN ('en','zh','id'));
ALTER TABLE "PageLayout" DROP CONSTRAINT "PageLayout_locale_check";
ALTER TABLE "PageLayout" ADD CONSTRAINT "PageLayout_locale_check" CHECK ("locale" IN ('en','zh','id'));
COMMIT;
