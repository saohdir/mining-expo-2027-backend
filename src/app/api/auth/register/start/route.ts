import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {randomUUID} from "node:crypto";
import {db} from "@/lib/db";
import {failure} from "@/lib/errors";
import {requireEnabled} from "@/lib/policy";
import {clientIpHash} from "@/lib/request-meta";
import {otpChannels} from "@/lib/app-settings";
import {HttpError} from "@/lib/errors";
import {assertSameOrigin} from "@/lib/customer-auth";
import {assertOtpBudget, normalizeEmail, REGISTER_GENERIC, sendAlreadyRegisteredNotice, sendPasswordLink, sendRegistrationOtp, OTP_TTL_MS, RESEND_AFTER_MS} from "@/lib/customer-auth-flows";

const schema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120), email: z.string().trim().email("Enter a valid email address"),
  acceptTerms: z.literal(true, {errorMap: () => ({message: "Accept the Terms & Conditions"})}),
  acceptPrivacy: z.literal(true, {errorMap: () => ({message: "Accept the Privacy Policy"})}),
  termsVersion: z.string().max(40).default("v1.4-UAT"), website: z.string().max(0).optional()
}).strict();

/** CR-AUTH-01 Step 1: account information → email OTP (registration only). The response never reveals
 * whether the email is already registered: existing accounts receive an explanatory email instead of a code. */
export async function POST(req: NextRequest) {
  try {
    requireEnabled("registration");
    assertSameOrigin(req);
    const x = schema.parse(await req.json());
    if (!(await otpChannels()).email) throw new HttpError(503, "EMAIL_UNAVAILABLE", "Email verification is temporarily unavailable. Try again later.");
    const email = normalizeEmail(x.email), ipHash = clientIpHash(req);
    await assertOtpBudget(email, ipHash);
    const generic = (challengeId: string) => NextResponse.json({message: REGISTER_GENERIC, challengeId, email, expiresInSeconds: OTP_TTL_MS / 1000, resendAfterSeconds: RESEND_AFTER_MS / 1000}, {headers: {"Cache-Control": "no-store"}});
    let acc = await db.customerAccount.findFirst({where: {email}});
    if (acc?.passwordHash) { await sendAlreadyRegisteredNotice(email).catch(() => {}); return generic(randomUUID()); }
    if (acc && acc.status === "ACTIVE") { await sendPasswordLink(acc.id, email, ipHash).catch(() => {}); return generic(randomUUID()); } // legacy OTP-only account
    if (acc && ["SUSPENDED", "CLOSED"].includes(acc.status)) return generic(randomUUID());
    if (!acc) acc = await db.customerAccount.create({data: {email, termsVersion: x.termsVersion, termsAcceptedAt: new Date(),
      profile: {create: {fullName: x.fullName, consentAt: new Date(), consentVersion: x.termsVersion}}}});
    else await db.customerAccount.update({where: {id: acc.id}, data: {termsVersion: x.termsVersion, termsAcceptedAt: new Date(), profile: {update: {fullName: x.fullName}}}});
    const challengeId = await sendRegistrationOtp(acc.id, email, ipHash);
    await db.auditLog.create({data: {accountId: acc.id, action: "REGISTRATION_OTP_SENT", resourceType: "CustomerAccount", resourceId: acc.id}});
    return generic(challengeId);
  } catch (e) { return failure(e); }
}
