import {NextRequest, NextResponse} from "next/server";
import {activeEventCode} from "@/lib/active-event";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {requireEnabled} from "@/lib/policy";
import {badgesPdf, type Badge} from "@/lib/badges";

const RANK: Record<string, number> = {EXHIBITOR: 3, DELEGATE: 2, VISITOR: 1};
/** FR-154: badges for people holding an ACTIVE pass. ?category=VISITOR|DELEGATE|EXHIBITOR, ?conferenceId=, ?format=pdf. */
export async function GET(req: NextRequest) {
  try {
    requireEnabled("bulkTools");
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const sp = req.nextUrl.searchParams;
    const category = sp.get("category") || "", conferenceId = sp.get("conferenceId") || undefined;
    if (category && !RANK[category]) throw new HttpError(400, "BAD_CATEGORY", "Unknown category.");
    const event = await db.event.findUnique({where: {code: sp.get("event") || activeEventCode()}});
    if (!event) throw new HttpError(404, "NOT_FOUND", "Event not found");
    const passes = await db.eventPass.findMany({where: {eventId: event.id, status: "ACTIVE", ...(conferenceId ? {enrollment: {conferenceId}} : {})},
      select: {accountId: true, enrollment: {select: {type: true, profileSnapshot: true}}, account: {select: {profile: {select: {fullName: true, organization: true, jobTitle: true}}}}}});
    const people = new Map<string, Badge>();
    for (const p of passes) {
      const role = (p.enrollment.profileSnapshot as {role?: string} | null)?.role;
      const cat = role === "EXHIBITOR_STAFF" ? "EXHIBITOR" : p.enrollment.type === "CONFERENCE" ? "DELEGATE" : "VISITOR";
      const prev = people.get(p.accountId);
      if (prev && RANK[prev.category] >= RANK[cat]) continue;
      const pr = p.account.profile;
      people.set(p.accountId, {name: pr?.fullName || "Guest", organization: pr?.organization || "", jobTitle: pr?.jobTitle || "", category: cat});
    }
    const list = [...people.values()].filter(b => !category || b.category === category).sort((a, b) => a.name.localeCompare(b.name));
    if (sp.get("format") !== "pdf") return NextResponse.json({count: list.length, byCategory: Object.fromEntries(Object.keys(RANK).map(k => [k, list.filter(b => b.category === k).length]))}, {headers: {"Cache-Control": "private,no-store"}});
    if (!list.length) throw new HttpError(404, "NO_BADGES", "No badge holders match this filter.");
    if (list.length > 2000) throw new HttpError(413, "TOO_MANY", "Print at most 2000 badges at once; filter by category or programme.");
    const bytes = await badgesPdf(event.title, list);
    await db.auditLog.create({data: {adminId: actor.id, action: "BADGES_PRINTED", resourceType: "Event", resourceId: event.id, afterState: {count: list.length, category: category || "ALL", conferenceId: conferenceId || null}}});
    return new NextResponse(Buffer.from(bytes), {headers: {"Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=\"imdx-badges.pdf\"", "Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
