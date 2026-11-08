import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {cookies} from "next/headers";
import {db} from "@/lib/db";
import {customerSession} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {constantEqual, hashToken, otpHash} from "@/lib/security";

const schema = z.object({challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/)}).strict();
/** Completes FR-116: verified new contact replaces the old one; all OTHER sessions are revoked
 * and the previous address is notified (account-takeover signal). */
export async function POST(req: NextRequest) {
  try {
    const sess = await customerSession();
    const x = schema.parse(await req.json());
    const ch = await db.otpChallenge.findUnique({where: {id: x.challengeId}});
    const invalid = new HttpError(400, "OTP_INVALID", "Code expired or invalid.");
    if (!ch || ch.accountId !== sess.accountId || ch.purpose !== "CONTACT_CHANGE" || !ch.newDestination || ch.consumedAt || ch.expiresAt < new Date() || ch.attemptCount >= 5) throw invalid;
    await db.otpChallenge.update({where: {id: ch.id}, data: {attemptCount: {increment: 1}}});
    if (!constantEqual(otpHash(ch.id, x.code), ch.codeHash)) throw invalid;
    const current = hashToken((await cookies()).get("imdx_customer_session")?.value || "");
    const out = await db.$transaction(async tx => {
      const used = await tx.otpChallenge.updateMany({where: {id: ch.id, consumedAt: null}, data: {consumedAt: new Date()}});
      if (used.count !== 1) throw new HttpError(409, "OTP_ALREADY_USED", "Code was already used.");
      const before = await tx.customerAccount.findUniqueOrThrow({where: {id: sess.accountId}});
      const data = ch.channel === "EMAIL" ? {email: ch.newDestination!, verifiedEmailAt: new Date()} : {phone: ch.newDestination!, verifiedPhoneAt: new Date()};
      await tx.customerAccount.update({where: {id: sess.accountId}, data});
      const revoked = await tx.customerSession.updateMany({where: {accountId: sess.accountId, revokedAt: null, tokenHash: {not: current}}, data: {revokedAt: new Date()}});
      await tx.auditLog.create({data: {accountId: sess.accountId, action: "CUSTOMER_CONTACT_CHANGED", resourceType: "CustomerAccount", resourceId: sess.accountId,
        beforeState: {channel: ch.channel, hadValue: ch.channel === "EMAIL" ? !!before.email : !!before.phone}, afterState: {channel: ch.channel, otherSessionsRevoked: revoked.count}}});
      if (ch.channel === "EMAIL" && before.email) await tx.notificationOutbox.create({data: {topic: "CONTACT_CHANGED", dedupeKey: "contact-changed:" + ch.id, payload: {to: before.email}}});
      return {channel: ch.channel, otherSessionsRevoked: revoked.count};
    });
    return NextResponse.json({ok: true, ...out}, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
