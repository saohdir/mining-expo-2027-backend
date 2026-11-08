import {NextResponse} from "next/server";
import QRCode from "qrcode";
import {customer} from "@/lib/auth";
import {db} from "@/lib/db";
import {openToken} from "@/lib/security";
import {failure} from "@/lib/errors";
import {formatShortCode, shortCodeFor, shortCodeHash} from "@/lib/pass-code";

/** Owner-only active passes: QR (opaque token, no PII) + short manual code (FR-074/076). */
export async function GET() {
  try {
    const acc = await customer();
    const passes = await db.eventPass.findMany({where: {accountId: acc.id, status: "ACTIVE"},
      include: {enrollment: {select: {id: true, type: true, status: true}}, event: {select: {title: true, startsAt: true, endsAt: true, venue: true}}}});
    const output = await Promise.all(passes.filter(p => p.encryptedToken && p.enrollment.status === "CONFIRMED").map(async p => {
      const token = openToken(p.encryptedToken!);
      const code = shortCodeFor(token);
      if (!p.shortCodeHash) await db.eventPass.updateMany({where: {id: p.id, shortCodeHash: null}, data: {shortCodeHash: shortCodeHash(code)}});
      return {passId: p.id, entitlement: p.entitlement, createdAt: p.issuedAt, validUntil: p.expiresAt, event: p.event,
        holder: (await db.customerProfile.findUnique({where: {accountId: acc.id}, select: {fullName: true}}))?.fullName,
        manualCode: formatShortCode(code),
        qrDataUrl: await QRCode.toDataURL(token, {width: 360, margin: 2, errorCorrectionLevel: "M", color: {dark: "#000000", light: "#ffffff"}})};
    }));
    return NextResponse.json({passes: output}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
