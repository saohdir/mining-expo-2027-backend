import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {failure, HttpError} from "@/lib/errors";
import {clientIpHash} from "@/lib/request-meta";
import {assertSameOrigin, loginEnabled} from "@/lib/customer-auth";
import {FORGOT_GENERIC, normalizeEmail, sendPasswordLink} from "@/lib/customer-auth-flows";

/** CR-AUTH-01 §3/§4: forgot password (and one-time setup for legacy OTP-only accounts). Always generic;
 * throttled per account and per IP; the link is single-use and short-lived. */
export async function POST(req: NextRequest) {
  try {
    if (!loginEnabled()) throw new HttpError(503, "NOT_ENABLED", "Sign-in is temporarily unavailable.");
    assertSameOrigin(req);
    const {email: raw} = z.object({email: z.string().trim().email("Enter a valid email address")}).strict().parse(await req.json());
    const email = normalizeEmail(raw), ipHash = clientIpHash(req), since = new Date(Date.now() - 3600000);
    if (await db.authToken.count({where: {ipHash, purpose: {in: ["RESET", "SETUP"]}, createdAt: {gte: since}}}) >= Number(process.env.RESET_IP_LIMIT_PER_HOUR || 10))
      throw new HttpError(429, "TOO_MANY_REQUESTS", "Too many requests. Try again later.");
    const acc = await db.customerAccount.findFirst({where: {email}});
    const eligible = acc && ["ACTIVE", "PENDING_VERIFICATION"].includes(acc.status) && (acc.verifiedEmailAt || acc.passwordHash);
    if (eligible && await db.authToken.count({where: {accountId: acc.id, purpose: {in: ["RESET", "SETUP"]}, createdAt: {gte: since}}}) < 3)
      await sendPasswordLink(acc.id, email, ipHash).catch(() => { /* delivery failures stay generic */ });
    return NextResponse.json({message: FORGOT_GENERIC}, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
