import {NextRequest, NextResponse} from "next/server";
import {db} from "@/lib/db";
import {failure} from "@/lib/errors";
import {hashToken} from "@/lib/security";

/** Lets the reset page show "link expired/used" before the user types a password. Does not consume the token. */
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token") || "";
    const row = token.length >= 20 ? await db.authToken.findUnique({where: {tokenHash: hashToken(token)}}) : null;
    const valid = !!row && !row.usedAt && row.expiresAt > new Date() && row.purpose !== "REGISTER";
    return NextResponse.json({valid, purpose: valid ? row!.purpose : null, expiresAt: valid ? row!.expiresAt : null}, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
