-- IMDX PRD v1.4 Slice F — finance controls (FR-126/128/131/132, AT-063/064/069/087).
-- Incremental after 20261108090000_floorplan_holds. Additive only: new nullable
-- columns with defaults and one new table. Apply after verified backup.
BEGIN;
ALTER TABLE "Invoice" ADD COLUMN "cancelledAt" TIMESTAMP(3), ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "ManualTransfer"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'FINANCE',
  ADD COLUMN "submittedBy" TEXT,
  ADD COLUMN "submittedByAccountId" TEXT,
  ADD COLUMN "payerName" TEXT,
  ADD COLUMN "decisionReason" TEXT,
  ADD COLUMN "approvalRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ManualTransfer" ADD CONSTRAINT "ManualTransfer_source_check" CHECK ("source" IN ('FINANCE','CUSTOMER_PROOF'));
ALTER TABLE "ManualTransfer" ADD CONSTRAINT "ManualTransfer_amount_check" CHECK ("amountMinor" > 0);
CREATE INDEX "ManualTransfer_invoiceId_status_idx" ON "ManualTransfer"("invoiceId","status");
CREATE INDEX "ManualTransfer_bankReference_idx" ON "ManualTransfer"("bankReference");
ALTER TABLE "PaymentAdjustment" ADD COLUMN "evidenceRef" TEXT;
ALTER TABLE "PaymentAdjustment" ADD CONSTRAINT "PaymentAdjustment_type_check" CHECK ("type" IN ('REVERSAL','REFUND'));
ALTER TABLE "PaymentAdjustment" ADD CONSTRAINT "PaymentAdjustment_amount_check" CHECK ("amountMinor" > 0);
CREATE INDEX "PaymentAdjustment_invoiceId_idx" ON "PaymentAdjustment"("invoiceId");
CREATE TABLE "InvoiceDelivery" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "destinationMasked" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "outboxKey" TEXT,
  "sentBy" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "InvoiceDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InvoiceDelivery_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InvoiceDelivery_channel_check" CHECK ("channel" IN ('EMAIL','WHATSAPP')),
  CONSTRAINT "InvoiceDelivery_status_check" CHECK ("status" IN ('QUEUED','COMPOSED','SENT','FAILED'))
);
CREATE UNIQUE INDEX "InvoiceDelivery_outboxKey_key" ON "InvoiceDelivery"("outboxKey");
CREATE INDEX "InvoiceDelivery_invoiceId_createdAt_idx" ON "InvoiceDelivery"("invoiceId","createdAt");
COMMIT;
