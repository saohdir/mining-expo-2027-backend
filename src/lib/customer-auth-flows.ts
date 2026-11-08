import {randomUUID} from "node:crypto";
import {db} from "./db";
import {HttpError} from "./errors";
import {hashToken, newOtp, otpHash, safeEmail} from "./security";
import {sendMail, sendOtp} from "./mailer";
import {issueAuthToken, type TokenPurpose} from "./customer-auth";

const portal = () => (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
export const OTP_TTL_MS = 5 * 60000, RESEND_AFTER_MS = 60000;
export const REGISTER_GENERIC = "If this email can be used, a 6-digit verification code has been sent. Check your inbox.";
export const FORGOT_GENERIC = "If an account exists for this email, we sent a link to set a new password. It expires soon and works once.";

/** Throttle per destination and per IP on OTP challenges (NFR-23). */
export async function assertOtpBudget(email: string, ipHash: string) {
  const since = new Date(Date.now() - 3600000);
  const [byDest, byIp] = await Promise.all([db.otpChallenge.count({where: {destinationHash: hashToken(email), createdAt: {gte: since}}}), db.otpChallenge.count({where: {ipHash, createdAt: {gte: since}}})]);
  if (byDest >= Number(process.env.OTP_DESTINATION_LIMIT_PER_HOUR || 5) || byIp >= Number(process.env.OTP_IP_LIMIT_PER_HOUR || 60))
    throw new HttpError(429, "OTP_RATE_LIMIT", "Too many verification attempts. Try again later.");
}
/** Creates a hashed REGISTER OTP challenge and emails the code. Never used for login. */
export async function sendRegistrationOtp(accountId: string, email: string, ipHash: string) {
  const id = randomUUID(), code = newOtp();
  await db.otpChallenge.create({data: {id, accountId, channel: "EMAIL", destinationHash: hashToken(email), codeHash: otpHash(id, code), expiresAt: new Date(Date.now() + OTP_TTL_MS), purpose: "REGISTER", ipHash}});
  try { await sendOtp(email, code); }
  catch { await db.otpChallenge.deleteMany({where: {id}}); throw new HttpError(503, "DELIVERY_UNAVAILABLE", "The verification email could not be sent. Try again shortly."); }
  return id;
}
/** Emails a single-use password link (RESET for accounts with a password, SETUP for legacy OTP-only accounts). */
export async function sendPasswordLink(accountId: string, email: string, ipHash: string) {
  const acc = await db.customerAccount.findUniqueOrThrow({where: {id: accountId}});
  const purpose: TokenPurpose = acc.passwordHash ? "RESET" : "SETUP";
  const token = await db.$transaction(tx => issueAuthToken(tx, accountId, purpose, ipHash));
  const link = portal() + "/account/reset-password?token=" + encodeURIComponent(token);
  const mins = purpose === "RESET" ? 30 : 60;
  await sendMail(email, purpose === "RESET" ? "IMDX 2027 — reset your password" : "IMDX 2027 — set up your password",
    (purpose === "RESET" ? "We received a request to reset the password for your IMDX 2027 account." : "IMDX 2027 accounts now sign in with email and password. Set up your password to continue using your existing account and bookings.")
    + "\n\nOpen this link within " + mins + " minutes (it works once):\n" + link + "\n\nIf you did not request this, ignore this email — your account is unchanged.");
  await db.auditLog.create({data: {accountId, action: purpose === "RESET" ? "PASSWORD_RESET_REQUESTED" : "PASSWORD_SETUP_REQUESTED", resourceType: "CustomerAccount", resourceId: accountId}});
}
export async function sendAlreadyRegisteredNotice(email: string) {
  await sendMail(email, "IMDX 2027 — you already have an account",
    "Someone (hopefully you) tried to create an IMDX 2027 account with this email. You already have an account.\nSign in: " + portal() + "/account\nForgot your password? Use 'Forgot password' on the sign-in page.");
}
export const normalizeEmail = (e: string) => safeEmail(e);
