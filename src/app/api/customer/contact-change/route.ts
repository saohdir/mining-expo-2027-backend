import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {randomUUID} from "node:crypto";
import {db} from "@/lib/db";
import {customerSession} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {hashToken, newOtp, otpHash, safeEmail} from "@/lib/security";
import {sendOtp} from "@/lib/mailer";
import {sendSmsOtp} from "@/lib/sms";
import {clientIpHash} from "@/lib/request-meta";

const schema = z.object({channel: z.enum(["EMAIL", "SMS"]), value: z.string().min(5).max(200)}).strict();
const RECENT_AUTH_MS = 15 * 60 * 1000;

/** FR-116 / AT-086: changing email or phone needs a recent sign-in and an OTP sent to the NEW target. */
export async function POST(req: NextRequest) {
  try {
    const sess = await customerSession();
    if (Date.now() - sess.createdAt.getTime() > RECENT_AUTH_MS) throw new HttpError(401, "REAUTH_REQUIRED", "For your security, sign in again before changing contact details.");
    const x = schema.parse(await req.json());
    const value = x.channel === "EMAIL" ? safeEmail(z.string().email().parse(x.value)) : z.string().regex(/^\+[1-9]\d{7,14}$/).parse(x.value);
    if (x.channel === "SMS" && process.env.SMS_PROVIDER !== "twilio") throw new HttpError(503, "SMS_UNAVAILABLE", "SMS verification is not configured.");
    if ((x.channel === "EMAIL" ? sess.account.email : sess.account.phone) === value) throw new HttpError(400, "UNCHANGED", "This is already your verified contact.");
    const taken = await db.customerAccount.findFirst({where: x.channel === "EMAIL" ? {email: value} : {phone: value}, select: {id: true}});
    if (taken) throw new HttpError(409, "CONTACT_UNAVAILABLE", "This contact cannot be used. Contact the organizer if you believe this is wrong.");
    const recent = await db.otpChallenge.count({where: {accountId: sess.accountId, purpose: "CONTACT_CHANGE", createdAt: {gte: new Date(Date.now() - 3600000)}}});
    if (recent >= 5) throw new HttpError(429, "OTP_RATE_LIMIT", "Too many attempts. Try later.");
    const id = randomUUID(), code = newOtp();
    await db.otpChallenge.create({data: {id, accountId: sess.accountId, channel: x.channel, destinationHash: hashToken(value), codeHash: otpHash(id, code),
      expiresAt: new Date(Date.now() + 5 * 60000), purpose: "CONTACT_CHANGE", newDestination: value, ipHash: clientIpHash(req)}});
    try { if (x.channel === "SMS") await sendSmsOtp(value, code); else await sendOtp(value, code); }
    catch { await db.otpChallenge.deleteMany({where: {id}}); throw new HttpError(503, "DELIVERY_UNAVAILABLE", "Verification message could not be sent."); }
    return NextResponse.json({challengeId: id, expiresInSeconds: 300, message: "Enter the code sent to your new contact."}, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
