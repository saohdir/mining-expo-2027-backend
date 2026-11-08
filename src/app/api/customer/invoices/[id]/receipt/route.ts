import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {PDFDocument, StandardFonts, rgb} from "pdf-lib";
import {db} from "@/lib/db";
import {customer} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {ledgerTotals} from "@/lib/finance-ledger";
export const runtime = "nodejs";
/** FR-050: payment receipt ONLY for Finance-verified receipts (never from proof submission alone). */
export async function GET(_req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const acc = await customer();
    const {id} = await params; z.string().uuid().parse(id);
    const inv = await db.invoice.findFirst({where: {id, accountId: acc.id}, include: {transfers: {where: {status: "VERIFIED"}, orderBy: {verifiedAt: "asc"}}, adjustments: true, account: {include: {profile: true}}}});
    if (!inv) throw new HttpError(404, "NOT_FOUND", "Invoice not available.");
    const t = ledgerTotals(inv.totalMinor, inv.transfers, inv.adjustments);
    if (t.paid === 0n) throw new HttpError(409, "NO_VERIFIED_PAYMENT", "A receipt is available after Finance verifies a payment.");
    const pdf = await PDFDocument.create(); const page = pdf.addPage([595, 842]); const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let y = 792; const text = (s: string, size = 11, b = false) => { page.drawText(s.replace(/[^\x20-\x7E]/g, "?").slice(0, 100), {x: 44, y, size, font: b ? bold : font, color: rgb(.25, .12, .07)}); y -= size + 12; };
    text("IMDX 2027 - Payment receipt", 20, true); text("Invoice: " + inv.number, 12, true); text("Customer: " + (inv.account.profile?.fullName || inv.account.email || ""), 10);
    text("Status: " + (t.paid >= inv.totalMinor ? "PAID IN FULL" : "DOWN PAYMENT RECEIVED"), 12, true); y -= 6;
    for (const r of inv.transfers) text("Verified " + (r.verifiedAt?.toISOString().slice(0, 10) || "") + "  IDR " + r.amountMinor.toString(), 10);
    for (const a of inv.adjustments) text((a.type === "REVERSAL" ? "Correction" : "Refund") + " " + a.createdAt.toISOString().slice(0, 10) + "  -IDR " + a.amountMinor.toString(), 10);
    y -= 6; text("Invoice total: IDR " + inv.totalMinor.toString(), 11, true); text("Confirmed net receipts: IDR " + t.paid.toString(), 11); text("Outstanding: IDR " + t.outstanding.toString(), 11);
    y -= 12; text("Amounts were confirmed by the organizer's Finance team against bank records.", 9);
    if (process.env.APP_STAGE !== "production") page.drawText("UAT / NOT A VALID RECEIPT", {x: 120, y: 60, size: 18, font: bold, color: rgb(.7, .25, .1)});
    return new NextResponse(new Uint8Array(await pdf.save()), {headers: {"Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="imdx-receipt.pdf"', "Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
