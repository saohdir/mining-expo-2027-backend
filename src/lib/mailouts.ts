import type {Prisma, PrismaClient} from "@prisma/client";

/** FR-154 scheduled mailouts: event information e-mails to registered participants. Maker-checker (a second staff member
 * approves), sent by the worker through the outbox (one idempotent job per recipient, normal retries). Off unless
 * ENABLE_SCHEDULED_MAILOUTS=true. Recipients are derived at send time from confirmed registrations — never uploaded lists. */
export const SEGMENTS = ["ALL_CONFIRMED", "VISITORS", "CONFERENCE", "PROGRAMME", "EXHIBITORS", "PREREGISTERED"] as const;
export type Segment = typeof SEGMENTS[number];
export const mailoutsEnabled = () => process.env.ENABLE_SCHEDULED_MAILOUTS === "true";

export function segmentWhere(segment: Segment, conferenceId?: string | null): Prisma.EnrollmentWhereInput {
  const confirmed = {status: "CONFIRMED" as const};
  switch (segment) {
    case "VISITORS": return {...confirmed, type: "VISITOR"};
    case "CONFERENCE": return {...confirmed, type: "CONFERENCE"};
    case "PROGRAMME": return {...confirmed, type: "CONFERENCE", conferenceId: conferenceId || "__none__"};
    case "EXHIBITORS": return {OR: [{type: "EXHIBITOR", status: {in: ["SUBMITTED", "CONFIRMED"]}}, {...confirmed, profileSnapshot: {path: ["role"], equals: "EXHIBITOR_STAFF"}}]};
    case "PREREGISTERED": return {...confirmed, profileSnapshot: {path: ["role"], equals: "PREREGISTERED_VISITOR"}};
    default: return confirmed;
  }
}
export async function recipientIds(db: PrismaClient | Prisma.TransactionClient, segment: Segment, conferenceId?: string | null) {
  const rows = await db.enrollment.findMany({where: {...segmentWhere(segment, conferenceId), account: {status: "ACTIVE", email: {not: null}}}, select: {accountId: true}, distinct: ["accountId"]});
  return rows.map(r => r.accountId);
}
/** Worker step: due, approved mailouts → one outbox job per recipient. */
export async function dispatchMailouts(db: PrismaClient, now = new Date()) {
  if (!mailoutsEnabled()) return 0;
  const due = await db.mailout.findMany({where: {status: "SCHEDULED", sendAt: {lte: now}}, take: 5});
  for (const m of due) {
    const claimed = await db.mailout.updateMany({where: {id: m.id, status: "SCHEDULED"}, data: {status: "SENDING"}});
    if (!claimed.count) continue;
    const ids = await recipientIds(db, m.segment as Segment, m.conferenceId);
    for (let i = 0; i < ids.length; i += 500)
      await db.notificationOutbox.createMany({data: ids.slice(i, i + 500).map(accountId => ({topic: "MAILOUT_SEND", dedupeKey: `mailout:${m.id}:${accountId}`, payload: {mailoutId: m.id, accountId}})), skipDuplicates: true});
    await db.mailout.update({where: {id: m.id}, data: {status: "SENT", recipients: ids.length}});
    await db.auditLog.create({data: {action: "MAILOUT_DISPATCHED", resourceType: "Mailout", resourceId: m.id, afterState: {recipients: ids.length}}});
  }
  return due.length;
}
export const MAILOUT_FOOTER = "\n\n—\nYou receive this service message because you are registered for IMDX 2027. Manage your registration: ";
