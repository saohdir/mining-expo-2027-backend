import {NextRequest, NextResponse} from "next/server";
import {failure} from "@/lib/errors";
import {previewInvitation} from "@/lib/invitations";

/** Invitation preview for the accept page (masked email, inviting company/programme only). */
export async function GET(req: NextRequest) {
  try { return NextResponse.json(await previewInvitation(req.nextUrl.searchParams.get("token") || ""), {headers: {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"}}); }
  catch (e) { return failure(e); }
}
