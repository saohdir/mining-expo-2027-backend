-- FR-059 group discount lines; FR-154 scheduled mailouts (maker-checker). Additive.
BEGIN;
ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_kind_check";
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_kind_check" CHECK ("kind" IN ('ITEM','TAX','FEE','DISCOUNT'));
CREATE TABLE "Mailout" (
  "id" TEXT NOT NULL, "subject" TEXT NOT NULL, "body" TEXT NOT NULL, "segment" TEXT NOT NULL, "conferenceId" TEXT,
  "sendAt" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "createdBy" TEXT NOT NULL, "approvedBy" TEXT,
  "recipients" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Mailout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Mailout_status_check" CHECK ("status" IN ('DRAFT','SCHEDULED','SENDING','SENT','CANCELLED')),
  CONSTRAINT "Mailout_segment_check" CHECK ("segment" IN ('ALL_CONFIRMED','VISITORS','CONFERENCE','PROGRAMME','EXHIBITORS','PREREGISTERED'))
);
CREATE INDEX "Mailout_status_sendAt_idx" ON "Mailout"("status","sendAt");
COMMIT;
