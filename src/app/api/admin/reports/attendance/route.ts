import {NextRequest, NextResponse} from "next/server";
import {activeEventCode} from "@/lib/active-event";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";

const count = <T,>(rows: T[], key: (r: T) => string) => Object.entries(rows.reduce<Record<string, number>>((m, r) => { const k = key(r); m[k] = (m[k] || 0) + 1; return m; }, {})).map(([name, n]) => ({name, count: n}));

/** FR-087/136, NFR-25: unique people vs entries vs attempts, deduplicated by account, WIB day. Aggregates only. */
export async function GET(req: NextRequest) {
  try {
    await admin(["SUPER_ADMIN", "OPERATIONS", "FINANCE", "SALES", "VIEWER"]);
    const sp = req.nextUrl.searchParams;
    const day = sp.get("day"), gate = sp.get("gate")?.slice(0, 60) || undefined, zone = sp.get("zone")?.slice(0, 60) || undefined;
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, "BAD_DAY", "Day must be YYYY-MM-DD.");
    const event = await db.event.findUnique({where: {code: sp.get("event") || activeEventCode()}});
    if (!event) throw new HttpError(404, "NOT_FOUND", "Event not found");
    const range = day ? {gte: new Date(day + "T00:00:00+07:00"), lt: new Date(Date.parse(day + "T00:00:00+07:00") + 86400000)} : undefined;
    const scanWhere = {gate, zone, ...(range ? {createdAt: range} : {}), OR: [{pass: {eventId: event.id}}, {passId: null}]};
    const [registrations, eligible, holders, admissions, accepted, rejected, accounts] = await Promise.all([
      db.enrollment.findMany({where: {eventId: event.id, status: {notIn: ["REJECTED", "CANCELLED"]}}, select: {accountId: true, type: true}}),
      db.enrollment.findMany({where: {eventId: event.id, status: "CONFIRMED"}, select: {accountId: true}}),
      db.eventPass.findMany({where: {eventId: event.id, status: "ACTIVE"}, select: {accountId: true}}),
      db.admission.findMany({where: {pass: {eventId: event.id}, gate, zone, ...(day ? {dayKey: day} : {})}, select: {pass: {select: {accountId: true, enrollment: {select: {conference: {select: {title: true}}}}}}, gate: true, zone: true}}),
      db.passScan.findMany({where: {...scanWhere, result: "VALID_ACCEPTED"}, select: {gate: true, zone: true}}),
      db.passScan.findMany({where: {...scanWhere, result: {not: "VALID_ACCEPTED"}}, select: {result: true}}),
      db.customerAccount.count()
    ]);
    return NextResponse.json({
      event: event.title, filters: {day, gate, zone, timezone: "Asia/Jakarta"},
      accounts, visitorRegistrations: registrations.filter(r => r.type === "VISITOR").length,
      conferenceBookings: registrations.filter(r => r.type === "CONFERENCE").length, exhibitorBookings: registrations.filter(r => r.type === "EXHIBITOR").length,
      registeredUnique: new Set(registrations.map(x => x.accountId)).size, eligibleUnique: new Set(eligible.map(x => x.accountId)).size,
      validPassHoldersUnique: new Set(holders.map(x => x.accountId)).size,
      arrivedUnique: new Set(admissions.map(x => x.pass.accountId)).size, admissionEntries: admissions.length,
      acceptedEntries: accepted.length, rejectedAttempts: rejected.length, scanAttempts: accepted.length + rejected.length,
      // FR-157: unique admitted people per conference session (only sessions with their own zone/gate policy).
      bySession: Object.entries(admissions.filter(a => a.pass.enrollment?.conference).reduce<Record<string, Set<string>>>((m, a) => { const t = a.pass.enrollment!.conference!.title; (m[t] ??= new Set()).add(a.pass.accountId); return m; }, {})).map(([session, set]) => ({session, uniqueAdmitted: set.size})),
      byGate: count(accepted, r => r.gate).map(x => ({gate: x.name, count: x.count})), byZone: count(accepted, r => r.zone).map(x => ({zone: x.name, count: x.count})),
      rejectedByReason: count(rejected, r => r.result).map(x => ({result: x.name, count: x.count}))
    }, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
