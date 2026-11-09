import type {Prisma} from "@prisma/client";
import {db} from "./db";

/** Prospect report: one row per PERSON (account) who registered as exhibition visitor, conference delegate or exhibitor,
 * for following up next year's edition. Everyone who registered is included (owner decision 9 Nov 2026: no separate opt-in). */
export type ProspectFilter = {eventId: string; type?: "VISITOR" | "CONFERENCE" | "EXHIBITOR"; conferenceId?: string; attended?: "yes" | "no"; q?: string};
const LIVE = {notIn: ["CANCELLED", "REJECTED"] as ("CANCELLED" | "REJECTED")[]};

export function prospectWhere(f: ProspectFilter): Prisma.CustomerAccountWhereInput {
  const enr: Prisma.EnrollmentWhereInput = {eventId: f.eventId, status: LIVE, ...(f.type ? {type: f.type} : {}), ...(f.conferenceId ? {conferenceId: f.conferenceId} : {})};
  const and: Prisma.CustomerAccountWhereInput[] = [{enrollments: {some: enr}}];
  if (f.attended === "yes") and.push({passes: {some: {eventId: f.eventId, admissions: {some: {}}}}});
  if (f.attended === "no") and.push({passes: {none: {eventId: f.eventId, admissions: {some: {}}}}});
  if (f.q) and.push({OR: [{email: {contains: f.q, mode: "insensitive"}}, {profile: {fullName: {contains: f.q, mode: "insensitive"}}}, {profile: {organization: {contains: f.q, mode: "insensitive"}}}, {profile: {jobTitle: {contains: f.q, mode: "insensitive"}}}]});
  return {AND: and};
}

const include = (eventId: string) => ({
  profile: {select: {salutation: true, fullName: true, jobTitle: true, organization: true, country: true}},
  enrollments: {where: {eventId, status: LIVE}, select: {type: true, status: true, createdAt: true, conference: {select: {title: true}}}},
  requests: {where: {eventId}, select: {status: true, companySnapshot: true}},
  passes: {where: {eventId}, select: {admissions: {select: {admittedAt: true}, take: 1, orderBy: {admittedAt: "asc" as const}}}}
}) satisfies Prisma.CustomerAccountInclude;

export type ProspectRow = {id: string; salutation: string; name: string; jobTitle: string; company: string; email: string; whatsapp: string; country: string;
  roles: string[]; programmes: string[]; exhibitorProducts: string; boothLocation: string; attended: boolean; firstCheckIn: string | null; registeredAt: string};

export function toRow(a: Prisma.CustomerAccountGetPayload<{include: ReturnType<typeof include>}>): ProspectRow {
  const types = new Set(a.enrollments.map(e => e.type));
  const roles = [types.has("VISITOR") && "Visitor", types.has("CONFERENCE") && "Conference", (types.has("EXHIBITOR") || a.requests.length) && "Exhibitor"].filter(Boolean) as string[];
  const cs = (a.requests[0]?.companySnapshot || {}) as {name?: string; products?: string; location?: string};
  const first = a.passes.flatMap(p => p.admissions).map(x => x.admittedAt).sort((x, y) => x.getTime() - y.getTime())[0];
  return {id: a.id, salutation: a.profile?.salutation === "IBU" ? "Ibu" : a.profile?.salutation === "BAPAK" ? "Bapak" : "", name: a.profile?.fullName || "",
    jobTitle: a.profile?.jobTitle || "", company: a.profile?.organization || cs.name || "", email: a.email || "", whatsapp: a.verifiedPhoneAt ? a.phone || "" : "", country: a.profile?.country || "",
    roles, programmes: [...new Set(a.enrollments.map(e => e.conference?.title).filter(Boolean) as string[])], exhibitorProducts: cs.products || "", boothLocation: cs.location || "",
    attended: Boolean(first), firstCheckIn: first ? first.toISOString() : null,
    registeredAt: (a.enrollments.map(e => e.createdAt).sort((x, y) => x.getTime() - y.getTime())[0] || a.createdAt).toISOString()};
}

export async function prospects(f: ProspectFilter, page: {skip: number; take: number}) {
  const where = prospectWhere(f);
  const [total, rows] = await Promise.all([db.customerAccount.count({where}),
    db.customerAccount.findMany({where, include: include(f.eventId), orderBy: {createdAt: "desc"}, skip: page.skip, take: page.take})]);
  return {total, rows: rows.map(toRow)};
}

/** Summary across ALL people of the event, independent of paging. */
export async function prospectSummary(f: ProspectFilter) {
  const all = await db.customerAccount.findMany({where: prospectWhere(f), include: include(f.eventId), take: 50000});
  const rows = all.map(toRow);
  const top = (pick: (r: ProspectRow) => string) => Object.entries(rows.reduce<Record<string, number>>((m, r) => { const k = pick(r).trim(); if (k) m[k] = (m[k] || 0) + 1; return m; }, {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, count]) => ({label, count}));
  return {people: rows.length, attended: rows.filter(r => r.attended).length, withWhatsapp: rows.filter(r => r.whatsapp).length,
    byRole: ["Visitor", "Conference", "Exhibitor"].map(label => ({label, count: rows.filter(r => r.roles.includes(label)).length})),
    topCompanies: top(r => r.company), topJobTitles: top(r => r.jobTitle), topCountries: top(r => r.country)};
}

export async function prospectExport(f: ProspectFilter) {
  const rows = await db.customerAccount.findMany({where: prospectWhere(f), include: include(f.eventId), orderBy: {createdAt: "asc"}, take: 100000});
  return rows.map(toRow);
}
