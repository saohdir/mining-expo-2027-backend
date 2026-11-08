import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {failure, HttpError} from "@/lib/errors";
import {hashToken} from "@/lib/security";
import {createCustomerSession} from "@/lib/auth";
import {clientIpHash, safeReturnPath} from "@/lib/request-meta";
import {assertSameOrigin, GENERIC_LOGIN_ERROR, loginEnabled, verifyCustomerPassword} from "@/lib/customer-auth";
import {normalizeEmail} from "@/lib/customer-auth-flows";

const schema = z.object({email: z.string().trim().email("Enter a valid email address"), password: z.string().min(1, "Enter your password").max(200), returnTo: z.string().max(300).optional()}).strict();
const WINDOW_MS = 15 * 60000;
/** CR-AUTH-01 §2: email + password sign-in (no OTP). Generic errors, per-email and per-IP throttling
 * (credential stuffing), constant-work password check, session rotation, audit without secrets.
 * Independent from the registration flag. */
export async function POST(req: NextRequest) {
  try {
    if (!loginEnabled()) throw new HttpError(503, "NOT_ENABLED", "Sign-in is temporarily unavailable.");
    assertSameOrigin(req);
    const x = schema.parse(await req.json());
    const email = normalizeEmail(x.email), emailHash = hashToken("login:" + email), ipHash = clientIpHash(req), since = new Date(Date.now() - WINDOW_MS);
    const [byEmail, byIp] = await Promise.all([
      db.loginAttempt.count({where: {emailHash, success: false, createdAt: {gte: since}}}),
      db.loginAttempt.count({where: {ipHash, success: false, createdAt: {gte: since}}})]);
    if (byEmail >= Number(process.env.LOGIN_EMAIL_FAIL_LIMIT || 5) || byIp >= Number(process.env.LOGIN_IP_FAIL_LIMIT || 30))
      throw new HttpError(429, "TOO_MANY_ATTEMPTS", "Too many sign-in attempts. Wait 15 minutes or reset your password.");
    const acc = await db.customerAccount.findFirst({where: {email}});
    const passwordOk = await verifyCustomerPassword(x.password, acc?.passwordHash);
    const ok = !!acc && passwordOk && acc.status === "ACTIVE";
    await db.loginAttempt.create({data: {accountId: acc?.id ?? null, emailHash, ipHash, success: ok}});
    if (!ok) {
      if (acc) {
        await db.customerAccount.update({where: {id: acc.id}, data: {failedLoginCount: {increment: 1}}});
        await db.auditLog.create({data: {accountId: acc.id, action: "CUSTOMER_LOGIN_FAILED", resourceType: "CustomerAccount", resourceId: acc.id}});
      }
      throw new HttpError(401, "INVALID_CREDENTIALS", GENERIC_LOGIN_ERROR);
    }
    await db.customerAccount.update({where: {id: acc.id}, data: {failedLoginCount: 0, lastLoginAt: new Date()}});
    await db.auditLog.create({data: {accountId: acc.id, action: "CUSTOMER_SIGNED_IN", resourceType: "CustomerAccount", resourceId: acc.id, afterState: {method: "PASSWORD"}}});
    await createCustomerSession(acc.id);
    return NextResponse.json({ok: true, next: safeReturnPath(x.returnTo)}, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
