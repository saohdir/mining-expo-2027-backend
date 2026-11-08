import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {randomUUID} from "node:crypto";
import {db} from "@/lib/db";
import {failure, HttpError} from "@/lib/errors";
import {requireEnabled} from "@/lib/policy";
import {clientIpHash} from "@/lib/request-meta";
import {assertSameOrigin} from "@/lib/customer-auth";
import {assertOtpBudget, REGISTER_GENERIC, sendRegistrationOtp, OTP_TTL_MS, RESEND_AFTER_MS} from "@/lib/customer-auth-flows";

/** Resend a registration code: 60 s cooldown, destination/IP budget, previous code invalidated. */
export async function POST(req: NextRequest) {
  try {
    requireEnabled("registration");
    assertSameOrigin(req);
    const {challengeId} = z.object({challengeId: z.string().uuid()}).strict().parse(await req.json());
    const ok = (id: string) => NextResponse.json({message: REGISTER_GENERIC, challengeId: id, expiresInSeconds: OTP_TTL_MS / 1000, resendAfterSeconds: RESEND_AFTER_MS / 1000}, {headers: {"Cache-Control": "no-store"}});
    const ch = await db.otpChallenge.findUnique({where: {id: challengeId}, include: {account: true}});
    if (!ch || ch.purpose !== "REGISTER" || ch.account.passwordHash || !ch.account.email) return ok(randomUUID()); // decoy stays indistinguishable
    if (Date.now() - ch.createdAt.getTime() < RESEND_AFTER_MS) throw new HttpError(429, "RESEND_TOO_SOON", "Please wait a minute before requesting another code.");
    const ipHash = clientIpHash(req);
    await assertOtpBudget(ch.account.email, ipHash);
    await db.otpChallenge.updateMany({where: {accountId: ch.accountId, purpose: "REGISTER", consumedAt: null}, data: {expiresAt: new Date()}});
    return ok(await sendRegistrationOtp(ch.accountId, ch.account.email, ipHash));
  } catch (e) { return failure(e); }
}
