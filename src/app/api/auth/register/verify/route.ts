import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {failure, HttpError} from "@/lib/errors";
import {requireEnabled} from "@/lib/policy";
import {constantEqual, otpHash} from "@/lib/security";
import {clientIpHash} from "@/lib/request-meta";
import {assertSameOrigin, issueAuthToken} from "@/lib/customer-auth";

/** CR-AUTH-01 Step 2: verify the registration OTP (single use, 5 attempts, ≤5 min). Success marks the email
 * verified and returns a short-lived single-use token that ONLY allows creating the password (Step 3).
 * It never creates a session — OTP cannot be used to sign in. */
export async function POST(req: NextRequest) {
  try {
    requireEnabled("registration");
    assertSameOrigin(req);
    const x = z.object({challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code")}).strict().parse(await req.json());
    const invalid = new HttpError(400, "OTP_INVALID", "The code is incorrect or has expired.");
    const ch = await db.otpChallenge.findUnique({where: {id: x.challengeId}, include: {account: true}});
    if (!ch || ch.purpose !== "REGISTER" || ch.consumedAt || ch.attemptCount >= 5 || ch.account.passwordHash) throw invalid;
    if (ch.expiresAt < new Date()) throw new HttpError(400, "OTP_EXPIRED", "This code has expired. Request a new code.");
    await db.otpChallenge.update({where: {id: ch.id}, data: {attemptCount: {increment: 1}}});
    if (!constantEqual(otpHash(ch.id, x.code), ch.codeHash)) throw ch.attemptCount + 1 >= 5 ? new HttpError(400, "OTP_LOCKED", "Too many incorrect attempts. Request a new code.") : invalid;
    const token = await db.$transaction(async tx => {
      const used = await tx.otpChallenge.updateMany({where: {id: ch.id, consumedAt: null}, data: {consumedAt: new Date()}});
      if (used.count !== 1) throw invalid;
      await tx.customerAccount.update({where: {id: ch.accountId}, data: {verifiedEmailAt: new Date()}});
      await tx.auditLog.create({data: {accountId: ch.accountId, action: "REGISTRATION_EMAIL_VERIFIED", resourceType: "CustomerAccount", resourceId: ch.accountId}});
      return issueAuthToken(tx, ch.accountId, "REGISTER", clientIpHash(req));
    });
    return NextResponse.json({verified: true, setupToken: token, next: "create-password"}, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
