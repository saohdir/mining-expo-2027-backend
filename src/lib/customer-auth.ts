import {randomBytes, scrypt as scryptCb, timingSafeEqual} from "node:crypto";
import {promisify} from "node:util";
import type {NextRequest} from "next/server";
import type {Prisma} from "@prisma/client";
import {HttpError} from "./errors";
import {hashToken, randomToken} from "./security";

/** CR-AUTH-01 customer credentials. Passwords use scrypt (memory-hard, OWASP-recommended alternative to
 * Argon2id/bcrypt; no native dependency) with N=2^15, r=8, p=1, 16-byte salt, 64-byte key. */
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const N = 32768, R = 8, P = 1, KEYLEN = 64;
const maxmem = (n: number, r: number) => 128 * n * r * 2;
const DUMMY = ["scrypt", N, R, P, randomBytes(16).toString("base64"), randomBytes(KEYLEN).toString("base64")].join("$");

export async function hashCustomerPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, {N, r: R, p: P, maxmem: maxmem(N, R)});
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}
export async function verifyCustomerPassword(password: string, stored: string | null | undefined) {
  // Always do the same work, even without a stored hash (no account-existence timing oracle).
  const parts = (stored || DUMMY).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], "base64"), expected = Buffer.from(parts[5], "base64");
  const key = await scrypt(password.normalize("NFKC"), salt, expected.length, {N: n, r, p, maxmem: maxmem(n, r)});
  return Boolean(stored) && key.length === expected.length && timingSafeEqual(key, expected);
}
/** Password policy (NIST 800-63B style): 10–128 chars, letters + digits, not the email name, not trivial. */
export function passwordProblems(password: string, email?: string | null) {
  const p: string[] = [];
  if (password.length < 10) p.push("At least 10 characters");
  if (password.length > 128) p.push("At most 128 characters");
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) p.push("Use letters and numbers");
  const local = email ? email.split("@")[0].toLowerCase() : "";
  if (local.length >= 4 && password.toLowerCase().includes(local)) p.push("Must not contain your email name");
  if (/^(.)\1+$/.test(password) || ["password1234", "1234567890", "qwerty12345"].includes(password.toLowerCase())) p.push("Too easy to guess");
  return p;
}

export const TOKEN_TTL_MS = {REGISTER: 15 * 60000, RESET: 30 * 60000, SETUP: 60 * 60000} as const;
export type TokenPurpose = keyof typeof TOKEN_TTL_MS;
/** Single-use, short-lived, hashed token; issuing a new one invalidates older ones of the same purpose. */
export async function issueAuthToken(tx: Prisma.TransactionClient, accountId: string, purpose: TokenPurpose, ipHash?: string) {
  await tx.authToken.updateMany({where: {accountId, purpose, usedAt: null}, data: {usedAt: new Date()}});
  const token = randomToken();
  await tx.authToken.create({data: {accountId, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS[purpose]), ipHash}});
  return token;
}

/** CSRF defence for cookie-authenticated POSTs: reject cross-site Origin/Referer (SameSite=Lax is the first layer). */
export function assertSameOrigin(req: NextRequest) {
  const raw = req.headers.get("origin") || req.headers.get("referer");
  if (!raw) return; // non-browser client: no ambient cookies to abuse
  let origin: URL;
  try { origin = new URL(raw); } catch { throw new HttpError(403, "CROSS_SITE_REQUEST", "Request blocked."); }
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!host || origin.host !== host) throw new HttpError(403, "CROSS_SITE_REQUEST", "Request blocked.");
}
export const GENERIC_LOGIN_ERROR = "Email or password is incorrect.";
/** Login is controlled separately from registration (CR-AUTH-01 §2). */
export const loginEnabled = () => process.env.ENABLE_CUSTOMER_LOGIN !== "false";
