-- Prospect report: explicit, optional consent to be contacted about future IMDX editions (UU PDP: separate purpose). Additive.
BEGIN;
ALTER TABLE "CustomerProfile" ADD COLUMN "futureContactOptIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerProfile" ADD COLUMN "futureContactAt" TIMESTAMP(3);
COMMIT;
