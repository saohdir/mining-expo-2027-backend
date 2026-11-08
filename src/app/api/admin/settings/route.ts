import {NextResponse} from "next/server";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";
import {approvalThreshold} from "@/lib/finance-ledger";

/** Read-only configuration status for SUPER_ADMIN (FR-147/057, NFR-32). Never returns secret values;
 * changes are made through the server environment with owner approval. */
export async function GET() {
  try {
    await admin(["SUPER_ADMIN"]);
    const set = (k: string) => Boolean(process.env[k] && process.env[k]!.length > 0);
    return NextResponse.json({
      featureFlags: {registration: process.env.ENABLE_REGISTRATION === "true", invoices: process.env.ENABLE_INVOICES === "true", qrAdmission: process.env.ENABLE_QR_ADMISSION === "true",
        boothAllocationOnDp: process.env.ALLOW_BOOTH_ALLOCATION_ON_DP === "true", conferenceAccessOnDp: process.env.CONFERENCE_ACCESS_ON_DP === "true"},
      otp: {emailProvider: process.env.EMAIL_PROVIDER || "disabled", smsProvider: process.env.SMS_PROVIDER || "disabled", ipLimitPerHour: Number(process.env.OTP_IP_LIMIT_PER_HOUR || 60), destinationLimitPerHour: Number(process.env.OTP_DESTINATION_LIMIT_PER_HOUR || 5)},
      manualBank: {configured: set("APPROVED_BANK_NAME") && set("APPROVED_BANK_ACCOUNT_NAME") && set("APPROVED_BANK_ACCOUNT_NUMBER")},
      finance: {makerCheckerThresholdMinor: approvalThreshold()?.toString() ?? null},
      secrets: {otpHashSecret: set("OTP_HASH_SECRET"), qrEncryptionKey: set("QR_ENCRYPTION_KEY"), smtpPassword: set("SMTP_PASS"), adminSeedLeftover: set("ADMIN_SEED_PASSWORD")},
      paymentGateway: "NONE — manual bank transfer only (FR-151)"
    }, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
