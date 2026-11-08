BEGIN;
-- FR-125: configured tax/fee lines are stored as invoice items of their own kind.
ALTER TABLE "InvoiceItem" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'ITEM';
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_kind_check" CHECK ("kind" IN ('ITEM','TAX','FEE'));
COMMIT;
