-- NFR-10: privacy-safe analytics. Only (WIB day, event name, count) is stored — no ids, emails, IPs or tokens.
-- Counters are maintained by triggers inside the same transaction as the business write (rolled-back writes are not counted)
-- and survive retention purges of the underlying records. Additive.
BEGIN;
CREATE TABLE "AnalyticsDaily" (
  "day" DATE NOT NULL, "event" TEXT NOT NULL, "count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "AnalyticsDaily_pkey" PRIMARY KEY ("day","event")
);
CREATE FUNCTION imdx_track(ev TEXT) RETURNS void LANGUAGE sql AS $$
  INSERT INTO "AnalyticsDaily"("day","event","count") VALUES ((now() AT TIME ZONE 'Asia/Jakarta')::date, ev, 1)
  ON CONFLICT ("day","event") DO UPDATE SET "count" = "AnalyticsDaily"."count" + 1;
$$;
CREATE FUNCTION imdx_analytics_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'OtpChallenge' THEN
    IF TG_OP = 'INSERT' THEN PERFORM imdx_track('otp_requested');
    ELSIF OLD."consumedAt" IS NULL AND NEW."consumedAt" IS NOT NULL THEN PERFORM imdx_track('otp_verified'); END IF;
  ELSIF TG_TABLE_NAME = 'Enrollment' THEN PERFORM imdx_track('registration_started');
  ELSIF TG_TABLE_NAME = 'BoothRequest' THEN PERFORM imdx_track('booth_requested');
  ELSIF TG_TABLE_NAME = 'Invoice' THEN
    IF OLD."issuedAt" IS NULL AND NEW."issuedAt" IS NOT NULL THEN PERFORM imdx_track('invoice_issued'); END IF;
  ELSIF TG_TABLE_NAME = 'ManualTransfer' THEN
    IF (TG_OP = 'INSERT' AND NEW."status" = 'VERIFIED') OR (TG_OP = 'UPDATE' AND OLD."status" <> 'VERIFIED' AND NEW."status" = 'VERIFIED') THEN PERFORM imdx_track('manual_transfer_verified'); END IF;
  ELSIF TG_TABLE_NAME = 'EventPass' THEN PERFORM imdx_track('qr_pass_issued');
  ELSIF TG_TABLE_NAME = 'PassScan' THEN PERFORM imdx_track(CASE WHEN NEW."result" = 'VALID_ACCEPTED' THEN 'checkin_accepted' ELSE 'checkin_denied' END);
  ELSIF TG_TABLE_NAME = 'ExportJob' THEN PERFORM imdx_track('report_exported');
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER imdx_an_otp AFTER INSERT OR UPDATE OF "consumedAt" ON "OtpChallenge" FOR EACH ROW EXECUTE FUNCTION imdx_analytics_trigger();
CREATE TRIGGER imdx_an_enrollment AFTER INSERT ON "Enrollment" FOR EACH ROW EXECUTE FUNCTION imdx_analytics_trigger();
CREATE TRIGGER imdx_an_booth AFTER INSERT ON "BoothRequest" FOR EACH ROW EXECUTE FUNCTION imdx_analytics_trigger();
CREATE TRIGGER imdx_an_invoice AFTER UPDATE OF "issuedAt" ON "Invoice" FOR EACH ROW EXECUTE FUNCTION imdx_analytics_trigger();
CREATE TRIGGER imdx_an_transfer AFTER INSERT OR UPDATE OF "status" ON "ManualTransfer" FOR EACH ROW EXECUTE FUNCTION imdx_analytics_trigger();
CREATE TRIGGER imdx_an_pass AFTER INSERT ON "EventPass" FOR EACH ROW EXECUTE FUNCTION imdx_analytics_trigger();
CREATE TRIGGER imdx_an_scan AFTER INSERT ON "PassScan" FOR EACH ROW EXECUTE FUNCTION imdx_analytics_trigger();
CREATE TRIGGER imdx_an_export AFTER INSERT ON "ExportJob" FOR EACH ROW EXECUTE FUNCTION imdx_analytics_trigger();
COMMIT;
