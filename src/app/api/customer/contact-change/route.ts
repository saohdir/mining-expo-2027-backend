import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {randomUUID} from "node:crypto";
import {db} from "@/lib/db";
import {customerSession} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {hashToken, newOtp, otpHash, safeEmail} from "@/lib/security";
import {sendOtp} from "@/lib/mailer";
import {sendSmsOtp, smsAvailable} from "@/lib/sms";
import {sendWhatsAppOtp, whatsappOtpAvailable} from "@/lib/messaging";
import {normalizePhone} from "@/lib/participant";
import {clientIpHash} from "@/lib/request-meta";

const schema = z.object({channel: z.enum(["EMAIL", "SMS", "WHATSAPP"]), value: z.string().min(5).max(200)}).strict();
const RECENT_AUTH_MS = 15 * 60 * 1000;

/** FR-116 / AT-086: changing email or phone needs a recent sign-in and an OTP sent to the NEW target. */
export async function POST(req: NextRequest) {
  try {
    const sess = await customerSession();
    const x = schema.parse(await req.json());
    const phoneChannel = x.channel !== "EMAIL";
    // Adding a first WhatsApp number needs no re-authentication; REPLACING a verified contact does (account-takeover protection).
    const replacing = phoneChannel ? Boolean(sess.account.phone && sess.account.verifiedPhoneAt) : true;
    if (replacing && Date.now() - sess.createdAt.getTime() > RECENT_AUTH_MS) throw new HttpError(401, "REAUTH_REQUIRED", "For your security, sign in again before changing contact details.");
    const phone = phoneChannel ? normalizePhone(x.value) : null;
    if (phoneChannel && !phone) throw new HttpError(400, "INVALID_PHONE", "Enter a valid mobile number, e.g. 0812 3456 7890 or +62 812 3456 7890.");
    const value = x.channel === "EMAIL" ? safeEmail(z.string().email().parse(x.value)) : phone!;
    if (x.channel === "SMS" && !smsAvailable()) throw new HttpError(503, "SMS_UNAVAILABLE", "SMS verification is not configured.");
    if (x.channel === "WHATSAPP" && !whatsappOtpAvailable()) throw new HttpError(503, "WHATSAPP_UNAVAILABLE", "WhatsApp verification is not configured.");
    if ((x.channel === "EMAIL" ? sess.account.email : sess.account.verifiedPhoneAt ? sess.account.phone : null) === value) throw new HttpError(400, "UNCHANGED", "This is already your verified contact.");
    const taken = await db.customerAccount.findFirst({where: {...(x.channel === "EMAIL" ? {email: value} : {phone: value}), id: {not: sess.accountId}}, select: {id: true}});
    if (taken) throw new HttpError(409, "CONTACT_UNAVAILABLE", "This contact cannot be used. Contact the organizer if you believe this is wrong.");
    const recent = await db.otpChallenge.count({where: {accountId: sess.accountId, purpose: "CONTACT_CHANGE", createdAt: {gte: new Date(Date.now() - 3600000)}}});
    if (recent >= 5) throw new HttpError(429, "OTP_RATE_LIMIT", "Too many attempts. Try later.");
    const id = randomUUID(), code = newOtp();
    await db.otpChallenge.create({data: {id, accountId: sess.accountId, channel: x.channel, destinationHash: hashToken(value), codeHash: otpHash(id, code),
      expiresAt: new Date(Date.now() + 5 * 60000), purpose: "CONTACT_CHANGE", newDestination: value, ipHash: clientIpHash(req)}});
    try { if (x.channel === "SMS") await sendSmsOtp(value, code); else if (x.channel === "WHATSAPP") await sendWhatsAppOtp(value, code); else await sendOtp(value, code); }
    catch { await db.otpChallenge.deleteMany({where: {id}}); throw new HttpError(503, "DELIVERY_UNAVAILABLE", "Verification message could not be sent."); }
    return NextResponse.json({challengeId: id, expiresInSeconds: 300, message: "Enter the code sent to your new contact."}, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
