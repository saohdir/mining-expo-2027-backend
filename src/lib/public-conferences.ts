import {db} from "./db";
import {ACTIVE_CONFERENCE_STATUSES, conferenceAvailability} from "./conference-capacity";

/** FR-006: published programmes only; unapproved fields stay "to be announced" (never invented). */
export async function publicConferences(eventCode = "IMDX-2027") {
  const event = await db.event.findFirst({where: {code: eventCode, published: true}, include: {conferences: {where: {published: true}, orderBy: [{startsAt: "asc"}, {title: "asc"}]}}});
  if (!event) return null;
  const counts = await db.enrollment.groupBy({by: ["conferenceId"], where: {conferenceId: {in: event.conferences.map(c => c.id)}, type: "CONFERENCE", status: {in: ACTIVE_CONFERENCE_STATUSES}}, _count: {_all: true}});
  const byId = new Map(counts.map(c => [c.conferenceId, c._count._all]));
  const blocks = await db.contentItem.findMany({where: {kind: "PAGE_BLOCK", status: "PUBLISHED", slug: {in: event.conferences.map(c => "conference-" + c.slug)}}, select: {slug: true, locale: true, summary: true, body: true}});
  return {event, conferences: event.conferences.map(c => ({
    id: c.id, slug: c.slug, title: c.title, startsAt: c.startsAt,
    admissionMode: c.feeMinor === null ? "TBA" : c.feeMinor === 0n ? "FREE" : "MANUAL_INVOICE", feeMinor: c.feeMinor?.toString() ?? null, currency: c.currency,
    ...conferenceAvailability(c.capacity, byId.get(c.id) ?? 0, c.feeMinor),
    description: Object.fromEntries(blocks.filter(b => b.slug === "conference-" + c.slug).map(b => [b.locale, {summary: b.summary, body: b.body}]))
  }))};
}
export const wib = (d: Date) => d.toLocaleString("en-GB", {timeZone: "Asia/Jakarta", dateStyle: "full", timeStyle: "short"}) + " WIB";
export const idr = (v: string) => "IDR " + Number(v).toLocaleString("id-ID");
