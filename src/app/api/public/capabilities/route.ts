import {NextResponse} from "next/server";
import {otpChannels} from "@/lib/app-settings";
import {policies} from "@/lib/policy";
export async function GET() {
  const c = await otpChannels().catch(() => ({email: false, sms: false}));
  return NextResponse.json({emailOtp: c.email && Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM), smsOtp: c.sms && Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    manualTransferOnly: true, exhibitorStaff: policies.exhibitorStaff(), groupEnrollment: policies.groupEnrollment() && policies.registration(), environment: "UAT"}, {headers: {"Cache-Control": "no-store"}});
}
