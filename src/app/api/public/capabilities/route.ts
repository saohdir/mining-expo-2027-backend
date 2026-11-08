import {NextResponse} from "next/server";
import {otpChannels} from "@/lib/app-settings";
export async function GET() {
  const c = await otpChannels().catch(() => ({email: false, sms: false}));
  return NextResponse.json({emailOtp: c.email && Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM), smsOtp: c.sms && Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    manualTransferOnly: true, environment: "UAT"}, {headers: {"Cache-Control": "no-store"}});
}
