import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";
import {expireStale} from "@/lib/invitations";

/** FR-059: group delegate registrations awaiting organizer review (after manual invoice/payment). */
export async function GET() {
  try {
    await admin(["SUPER_ADMIN", "OPERATIONS", "FINANCE", "SALES", "VIEWER"]);
    await expireStale();
    const rows = await db.invitation.findMany({where: {kind: "GROUP_DELEGATE"}, orderBy: {createdAt: "desc"}, take: 2000});
    const [enr, confs, coords] = await Promise.all([
      db.enrollment.findMany({where: {id: {in: rows.map(r => r.enrollmentId).filter((x): x is string => !!x)}}, select: {id: true, status: true}}),
      db.conference.findMany({where: {id: {in: [...new Set(rows.map(r => r.conferenceId!))]}}, select: {id: true, title: true, feeMinor: true}}),
      db.customerAccount.findMany({where: {id: {in: [...new Set(rows.map(r => r.inviterAccountId))]}}, select: {id: true, email: true, profile: {select: {fullName: true, organization: true}}}})
    ]);
    const groups = new Map<string, {groupId: string; programme: string; feeMinor: string | null; coordinator: unknown; createdAt: Date; counts: Record<string, number>; delegates: unknown[]}>();
    for (const r of rows) {
      const c = confs.find(x => x.id === r.conferenceId), co = coords.find(x => x.id === r.inviterAccountId);
      const g = groups.get(r.groupId!) ?? {groupId: r.groupId!, programme: c?.title || "", feeMinor: c?.feeMinor?.toString() ?? null, createdAt: r.createdAt, counts: {},
        coordinator: {accountId: r.inviterAccountId, email: co?.email, name: co?.profile?.fullName, organization: co?.profile?.organization}, delegates: []};
      const reg = enr.find(e => e.id === r.enrollmentId)?.status || null;
      const k = reg || r.status; g.counts[k] = (g.counts[k] || 0) + 1;
      g.delegates.push({invitationId: r.id, fullName: r.fullName, email: r.email, invitation: r.status, registration: reg, enrollmentId: r.enrollmentId});
      groups.set(r.groupId!, g);
    }
    return NextResponse.json({groups: [...groups.values()]}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
