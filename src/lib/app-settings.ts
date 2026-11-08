import {db} from "./db";
/** FR-115 runtime switches. A channel is usable only when the server is configured AND the CMS switch is on
 * (the CMS can disable a provider immediately, never enable an unconfigured one). */
export const OTP_SWITCHES = {email: "otp.email.enabled", sms: "otp.sms.enabled"} as const;
export async function switchOn(key: string) { const s = await db.appSetting.findUnique({where: {key}}); return s ? s.value === "true" : true; }
export async function otpChannels() {
  const [e, s] = await Promise.all([switchOn(OTP_SWITCHES.email), switchOn(OTP_SWITCHES.sms)]);
  return {email: e && process.env.EMAIL_PROVIDER === "smtp", sms: s && process.env.SMS_PROVIDER === "twilio", emailSwitch: e, smsSwitch: s};
}
