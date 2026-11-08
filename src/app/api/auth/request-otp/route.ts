import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {randomUUID} from "node:crypto";
import {db} from "@/lib/db";
import {failure, HttpError} from "@/lib/errors";
import {requireEnabled} from "@/lib/policy";
import {hashToken, otpHash, newOtp, safeEmail} from "@/lib/security";
import {sendOtp} from "@/lib/mailer";
import {sendSmsOtp} from "@/lib/sms";
import {clientIpHash} from "@/lib/request-meta";
import {otpChannels} from "@/lib/app-settings";

const schema = z.object({mode: z.enum(["register", "login"]), channel: z.enum(["EMAIL", "SMS"]), email: z.string().email().optional(),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/).optional(), fullName: z.string().min(2).max(120).optional(), consent: z.boolean().optional(),
  consentVersion: z.string().max(40).optional(), website: z.string().max(0).optional()}).strict();
const GENERIC = "If the details are valid, a verification code has been sent.";
// NFR-23 throttles. Per-IP default allows shared NAT / venue Wi-Fi; tune per deployment.
const PER_DESTINATION_HOUR = Number(process.env.OTP_DESTINATION_LIMIT_PER_HOUR || 5), PER_IP_HOUR = Number(process.env.OTP_IP_LIMIT_PER_HOUR || 60);

/** FR-068/115, NFR-23, AT-059/061: hashed single-use OTP, ≤5 min, per-destination and per-IP
 * throttling, and responses that never reveal whether an account exists. */
export async function POST(req: NextRequest) {
  try {
    requireEnabled("registration");
    const x = schema.parse(await req.json());
    const destination = x.channel === "EMAIL" ? safeEmail(x.email || "") : x.phone || "";
    if ((x.channel === "EMAIL" && !x.email) || (x.channel === "SMS" && !x.phone)) throw new HttpError(400, "CONTACT_REQUIRED", "Enter a valid email or phone.");
    const channels = await otpChannels();
    if (x.channel === "SMS" && !channels.sms) throw new HttpError(503, "SMS_UNAVAILABLE", "SMS OTP is not available; choose email.");
    if (x.channel === "EMAIL" && !channels.email) throw new HttpError(503, "EMAIL_UNAVAILABLE", "Email OTP is not available right now.");
    if (x.mode === "register" && (!x.fullName || !x.consent || !x.consentVersion)) throw new HttpError(400, "CONSENT_REQUIRED", "Name and privacy consent required.");
    const ipHash = clientIpHash(req), since = new Date(Date.now() - 3600000);
    const [byDest, byIp] = await Promise.all([
      db.otpChallenge.count({where: {destinationHash: hashToken(destination), createdAt: {gte: since}}}),
      db.otpChallenge.count({where: {ipHash, createdAt: {gte: since}}})]);
    if (byDest >= PER_DESTINATION_HOUR || byIp >= PER_IP_HOUR) throw new HttpError(429, "OTP_RATE_LIMIT", "Too many verification attempts. Try later.");
    if (x.website) return NextResponse.json({message: GENERIC}, {headers: {"Cache-Control": "no-store"}}); // honeypot
    let account = await db.customerAccount.findFirst({where: x.channel === "EMAIL" ? {email: destination} : {phone: destination}});
    let purpose: "LOGIN" | "REGISTER" = "LOGIN";
    if (x.mode === "register" && account?.status !== "ACTIVE") {
      purpose = "REGISTER";
      if (!account) account = await db.customerAccount.create({data: {...(x.channel === "EMAIL" ? {email: destination} : {phone: destination}),
        profile: {create: {fullName: x.fullName!, consentAt: new Date(), consentVersion: x.consentVersion!}}}});
    }
    // Registering an existing ACTIVE account silently becomes a sign-in code (no enumeration).
    const id = randomUUID();
    const challengeId = account && ["ACTIVE", "PENDING_VERIFICATION"].includes(account.status) ? id : randomUUID();
    if (account && ["ACTIVE", "PENDING_VERIFICATION"].includes(account.status)) {
      const code = newOtp();
      await db.otpChallenge.create({data: {id, accountId: account.id, channel: x.channel, destinationHash: hashToken(destination), codeHash: otpHash(id, code),
        expiresAt: new Date(Date.now() + 5 * 60000), purpose, ipHash}});
      try { if (x.channel === "SMS") await sendSmsOtp(destination, code); else await sendOtp(destination, code); }
      catch { await db.otpChallenge.deleteMany({where: {id}}); throw new HttpError(503, "DELIVERY_UNAVAILABLE", "Verification message could not be sent."); }
    }
    // Unknown accounts get an indistinguishable decoy challenge id that can never verify.
    return NextResponse.json({message: GENERIC, challengeId, expiresInSeconds: 300}, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
