import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {customer} from "@/lib/auth";
import {failure} from "@/lib/errors";
/** FR-078: own attendance history (WIB day, zone, entitlement) without staff or gate-operator details. */
export async function GET() {
  try {
    const acc = await customer();
    const rows = await db.admission.findMany({where: {pass: {accountId: acc.id}}, orderBy: {admittedAt: "desc"}, take: 100,
      select: {dayKey: true, zone: true, admittedAt: true, pass: {select: {entitlement: true, enrollment: {select: {type: true, conference: {select: {title: true}}}}}}}});
    return NextResponse.json({attendance: rows.map(r => ({day: r.dayKey, zone: r.zone, at: r.admittedAt, entitlement: r.pass.entitlement, programme: r.pass.enrollment.conference?.title ?? null}))}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
