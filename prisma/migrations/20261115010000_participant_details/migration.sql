-- Participant details (visitor / conference / exhibitor forms): salutation on the profile and WhatsApp as an OTP channel
-- for verifying the participant's WhatsApp number. Additive.
ALTER TYPE "Channel" ADD VALUE IF NOT EXISTS 'WHATSAPP';
BEGIN;
ALTER TABLE "CustomerProfile" ADD COLUMN "salutation" TEXT;
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_salutation_check" CHECK ("salutation" IS NULL OR "salutation" IN ('BAPAK','IBU'));
COMMIT;
