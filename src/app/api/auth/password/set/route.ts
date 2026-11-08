import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {failure, HttpError} from "@/lib/errors";
import {policies} from "@/lib/policy";
import {hashToken} from "@/lib/security";
import {createCustomerSession} from "@/lib/auth";
import {assertSameOrigin, hashCustomerPassword, loginEnabled, passwordProblems} from "@/lib/customer-auth";

const schema = z.object({token: z.string().min(20).max(200), password: z.string().min(1).max(200), confirmPassword: z.string().min(1).max(200)}).strict();
/** CR-AUTH-01 Step 3 / reset / legacy setup: consume a single-use token and store an scrypt hash.
 * REGISTER activates the account and signs in; RESET/SETUP revoke all sessions and ask the user to sign in. */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const x = schema.parse(await req.json());
    const bad = new HttpError(400, "TOKEN_INVALID", "This link or step has expired or was already used. Start again.");
    const row = await db.authToken.findUnique({where: {tokenHash: hashToken(x.token)}});
    if (!row || row.usedAt || row.expiresAt < new Date()) throw bad;
    if (row.purpose === "REGISTER" && !policies.registration()) throw new HttpError(503, "NOT_ENABLED", "Registration is closed.");
    if (row.purpose !== "REGISTER" && !loginEnabled()) throw new HttpError(503, "NOT_ENABLED", "Sign-in is temporarily unavailable.");
    const acc = await db.customerAccount.findUnique({where: {id: row.accountId}});
    if (!acc || ["SUSPENDED", "CLOSED"].includes(acc.status)) throw bad;
    if (row.purpose === "REGISTER" && !acc.verifiedEmailAt) throw bad;
    if (x.password !== x.confirmPassword) throw new HttpError(400, "PASSWORD_MISMATCH", "Passwords do not match.");
    const problems = passwordProblems(x.password, acc.email);
    if (problems.length) throw new HttpError(400, "WEAK_PASSWORD", "Password requirements: " + problems.join("; ") + ".");
    const passwordHash = await hashCustomerPassword(x.password);
    await db.$transaction(async tx => {
      const used = await tx.authToken.updateMany({where: {id: row.id, usedAt: null, expiresAt: {gt: new Date()}}, data: {usedAt: new Date()}});
      if (used.count !== 1) throw bad;
      await tx.customerAccount.update({where: {id: acc.id}, data: {passwordHash, passwordSetAt: new Date(), status: "ACTIVE", failedLoginCount: 0, lockedUntil: null,
        // Clicking an emailed single-use link proves control of the address (legacy setup / reset).
        ...(row.purpose !== "REGISTER" && !acc.verifiedEmailAt ? {verifiedEmailAt: new Date()} : {})}});
      await tx.customerSession.updateMany({where: {accountId: acc.id, revokedAt: null}, data: {revokedAt: new Date()}});
      await tx.authToken.updateMany({where: {accountId: acc.id, usedAt: null}, data: {usedAt: new Date()}});
      await tx.auditLog.create({data: {accountId: acc.id, action: row.purpose === "REGISTER" ? "CUSTOMER_REGISTERED" : row.purpose === "RESET" ? "PASSWORD_RESET_COMPLETED" : "PASSWORD_SETUP_COMPLETED", resourceType: "CustomerAccount", resourceId: acc.id}});
    });
    if (row.purpose === "REGISTER") { await createCustomerSession(acc.id); return NextResponse.json({ok: true, signedIn: true, next: "/account"}, {headers: {"Cache-Control": "no-store"}}); }
    return NextResponse.json({ok: true, signedIn: false, next: "/account?signin=1", message: "Password updated. Sign in with your new password."}, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
