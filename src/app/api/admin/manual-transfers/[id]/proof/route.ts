import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {readPrivate} from "@/lib/private-files";

const MIME: Record<string, string> = {png: "image/png", jpg: "image/jpeg", webp: "image/webp", pdf: "application/pdf"};
/** Finance-only download of an encrypted customer payment proof (audited). */
export async function GET(_req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["FINANCE", "SUPER_ADMIN"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const t = await db.manualTransfer.findUnique({where: {id}, select: {proofUrl: true}});
    if (!t?.proofUrl) throw new HttpError(404, "NO_PROOF", "No proof file.");
    const bytes = await readPrivate(t.proofUrl);
    await db.auditLog.create({data: {adminId: actor.id, action: "PAYMENT_PROOF_VIEWED", resourceType: "ManualTransfer", resourceId: id}});
    return new NextResponse(new Uint8Array(bytes), {headers: {"Content-Type": MIME[t.proofUrl.split(".").pop()!] || "application/octet-stream",
      "Content-Disposition": "inline; filename=proof", "Cache-Control": "private,no-store", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"}});
  } catch (e) { return failure(e); }
}
