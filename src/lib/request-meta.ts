import type {NextRequest} from "next/server";
import {hashToken} from "./security";
/** Client IP behind Caddy → Nginx (X-Forwarded-For first hop). Only a salted hash is stored. */
export function clientIpHash(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return hashToken("ip:" + (process.env.OTP_HASH_SECRET || "") + ":" + ip);
}
/** Only same-site account paths may be used as post-login return targets (AT-057). */
export function safeReturnPath(value: unknown) {
  if (typeof value !== "string" || value.length > 300) return "/account";
  return /^\/account(\/[A-Za-z0-9/_-]*)?(\?[A-Za-z0-9=&_%.-]*)?(#[A-Za-z0-9_-]*)?$/.test(value) && !value.includes("//") ? value : "/account";
}
