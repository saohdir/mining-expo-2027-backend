import {NextResponse} from "next/server";
/** Retired by CR-AUTH-01: OTP is no longer a sign-in method. Registration uses /api/auth/register/*,
 * sign-in uses /api/auth/login. Kept as 410 so stale clients fail closed. */
export async function POST() {
  return NextResponse.json({error: "GONE", message: "Sign in with email and password. New accounts: use Create account."}, {status: 410, headers: {"Cache-Control": "no-store"}});
}
