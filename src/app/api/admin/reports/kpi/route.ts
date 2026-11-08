import {NextRequest, NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";
import {periodRange} from "@/lib/kpi-period";

export async function GET(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN", "SALES", "FINANCE", "OPERATIONS", "VIEWER", "CONTENT_EDITOR"]);
    const p = req.nextUrl.searchParams;
    const {from, to} = periodRange(p.get("period") || "30d", p.get("from"), p.get("to"));
    const r = from && to ? {gte: from, lt: to} : undefined;
    const [accounts, verified, regs, booths, offers, assigned, admissions, issued, receipts] = await Promise.all([
      db.customerAccount.count({where: r ? {createdAt: r} : {}}),
      db.customerAccount.count({where: {OR: [{verifiedEmailAt: r ?? {not: null}}, {verifiedPhoneAt: r ?? {not: null}}]}}),
      db.enrollment.findMany({where: r ? {createdAt: r} : {}, select: {type: true, accountId: true, status: true}}),
      db.boothRequest.findMany({where: r ? {createdAt: r} : {}, select: {requestedAreaSqm: true}}),
      db.boothOffer.count({where: r ? {createdAt: r} : {}}),
      db.boothAssignment.findMany({where: {active: true, ...(r ? {assignedAt: r} : {})}, select: {boothUnit: {select: {areaSqm: true}}}}),
      db.admission.findMany({where: r ? {admittedAt: r} : {}, select: {pass: {select: {accountId: true}}}}),
      db.invoice.count({where: {issuedAt: r ?? {not: null}}}),
      db.manualTransfer.findMany({where: {status: "VERIFIED", ...(r ? {verifiedAt: r} : {})}, select: {amountMinor: true}})]);
    const money = ["SUPER_ADMIN", "SALES", "FINANCE"].includes(actor.role);
    const by = (t: string) => regs.filter(x => x.type === t).length;
    return NextResponse.json({
      period: {from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, timezone: "Asia/Jakarta"},
      kpis: [
        {key: "accountsCreated", value: accounts, basis: "CustomerAccount.createdAt"},
        {key: "accountsVerified", value: verified, basis: "verifiedEmailAt / verifiedPhoneAt"},
        {key: "visitorRegistrations", value: by("VISITOR"), basis: "Enrollment.createdAt"},
        {key: "conferenceBookings", value: by("CONFERENCE"), basis: "Enrollment.createdAt"},
        {key: "exhibitorRequests", value: booths.length, basis: "BoothRequest.createdAt"},
        {key: "uniqueRegistrants", value: new Set(regs.map(x => x.accountId)).size, basis: "distinct account, Enrollment.createdAt"},
        {key: "requestedAreaSqm", value: Math.round(booths.reduce((a, b) => a + Number(b.requestedAreaSqm), 0) * 10) / 10, basis: "BoothRequest.createdAt"},
        {key: "quotationsIssued", value: offers, basis: "BoothOffer.createdAt"},
        {key: "assignedAreaSqm", value: Math.round(assigned.reduce((a, b) => a + Number(b.boothUnit.areaSqm), 0) * 10) / 10, basis: "BoothAssignment.assignedAt (active)"},
        {key: "uniqueArrivals", value: new Set(admissions.map(a => a.pass.accountId)).size, basis: "distinct account, Admission.admittedAt"},
        {key: "admissions", value: admissions.length, basis: "Admission.admittedAt"},
        ...(money ? [{key: "invoicesIssued", value: issued, basis: "Invoice.issuedAt"},
          {key: "verifiedReceiptsIdr", value: receipts.reduce((a, b) => a + b.amountMinor, 0n).toString(), basis: "ManualTransfer.verifiedAt (VERIFIED)"}] : [])
      ]
    }, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
