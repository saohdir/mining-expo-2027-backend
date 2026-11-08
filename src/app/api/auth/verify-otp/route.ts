import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {otpHash, constantEqual} from "@/lib/security";
import {createCustomerSession} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {safeReturnPath} from "@/lib/request-meta";

const schema = z.object({challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/), returnTo: z.string().max(300).optional()}).strict();
const INVALID = () => new HttpError(400, "OTP_INVALID", "Code expired or invalid.");

/** AT-059/061: single-use, ≤5 attempts, generic errors; AT-057: safe same-site return path. */
export async function POST(req: NextRequest) {
  try {
    const input = schema.parse(await req.json());
    const challenge = await db.otpChallenge.findUnique({where: {id: input.challengeId}});
    if (!challenge || challenge.purpose === "CONTACT_CHANGE" || challenge.consumedAt || challenge.expiresAt < new Date() || challenge.attemptCount >= 5) throw INVALID();
    await db.otpChallenge.update({where: {id: challenge.id}, data: {attemptCount: {increment: 1}}});
    if (!constantEqual(otpHash(challenge.id, input.code), challenge.codeHash)) throw INVALID();
    const accountId = await db.$transaction(async tx => {
      const consumed = await tx.otpChallenge.updateMany({where: {id: challenge.id, consumedAt: null, attemptCount: {lte: 5}, expiresAt: {gt: new Date()}}, data: {consumedAt: new Date()}});
      if (consumed.count !== 1) throw new HttpError(409, "OTP_ALREADY_USED", "Code was already used.");
      const acc = await tx.customerAccount.findUniqueOrThrow({where: {id: challenge.accountId}});
      if (["SUSPENDED", "CLOSED"].includes(acc.status)) throw INVALID();
      await tx.customerAccount.update({where: {id: acc.id}, data: {status: "ACTIVE", ...(challenge.channel === "SMS" ? {verifiedPhoneAt: new Date()} : {verifiedEmailAt: new Date()})}});
      await tx.auditLog.create({data: {accountId: acc.id, action: challenge.purpose === "REGISTER" ? "CUSTOMER_REGISTERED" : "CUSTOMER_SIGNED_IN", resourceType: "CustomerAccount", resourceId: acc.id, afterState: {channel: challenge.channel}}});
      return acc.id;
    });
    await createCustomerSession(accountId);
    return NextResponse.json({ok: true, next: safeReturnPath(input.returnTo)}, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
