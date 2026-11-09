import {NextResponse} from "next/server";
import {otpChannels} from "@/lib/app-settings";
import {policies} from "@/lib/policy";
import {smsAvailable} from "@/lib/sms";
export async function GET() {
  const c = await otpChannels().catch(() => ({email: false, sms: false}));
  return NextResponse.json({emailOtp: c.email && Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM), smsOtp: c.sms && smsAvailable(),
    manualTransferOnly: true, exhibitorStaff: policies.exhibitorStaff(), groupEnrollment: policies.groupEnrollment() && policies.registration(), feeEstimator: policies.feeEstimator(), environment: "UAT", sampleProviders: process.env.SMS_PROVIDER === "mailpit" || process.env.WHATSAPP_PROVIDER === "mailpit"}, {headers: {"Cache-Control": "no-store"}});
}
