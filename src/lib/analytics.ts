/** NFR-10 event names. Counters are written by DB triggers (migration 20261112010000_analytics); never PII. */
export const ANALYTICS_EVENTS = ["otp_requested", "otp_verified", "registration_started", "booth_requested", "invoice_issued", "manual_transfer_verified", "qr_pass_issued", "checkin_accepted", "checkin_denied", "report_exported"];
