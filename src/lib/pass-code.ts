import {createHmac} from "node:crypto";
import {hashToken} from "./security";

/** Short manual fallback code (FR-076/086): 10 chars Crockford base32 (~50 bits) derived from the
 * opaque token with a server secret. Only its hash is stored; guesses are rate-limited per staff. */
const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function shortCodeFor(token: string) {
  const secret = process.env.QR_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) throw new Error("QR_ENCRYPTION_KEY not configured");
  const mac = createHmac("sha256", secret).update("short-code:" + token).digest();
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHA[mac[i] & 31];
  return out;
}
export const normalizeShortCode = (v: string) => v.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
export const shortCodeHash = (code: string) => hashToken("short:" + normalizeShortCode(code));
export const formatShortCode = (c: string) => c.slice(0, 5) + "-" + c.slice(5);
export const isShortCode = (v: string) => /^[0-9A-Z]{10}$/.test(normalizeShortCode(v));
