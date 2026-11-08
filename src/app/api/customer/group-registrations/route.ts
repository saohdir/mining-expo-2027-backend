import {randomUUID} from "node:crypto";
import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {customer} from "@/lib/auth";
import {db} from "@/lib/db";
import {failure, HttpError} from "@/lib/errors";
import {requireEnabled} from "@/lib/policy";
import {assertSameOrigin} from "@/lib/customer-auth";
import {safeEmail} from "@/lib/security";
import {ACTIVE_CONFERENCE_STATUSES, conferenceAvailability} from "@/lib/conference-capacity";
import {createInvitations, expireStale, GROUP_MAX, groupsOf} from "@/lib/invitations";

const schema = z.object({
  conferenceId: z.string().uuid(),
  delegates: z.array(z.object({email: z.string().email().max(200), fullName: z.string().trim().min(2).max(120)}).strict()).min(2).max(GROUP_MAX),
  consent: z.literal(true)
}).strict();
const H = {headers: {"Cache-Control": "private,no-store"}};

/** FR-059: a coordinator registers several delegates for one programme. Each delegate gets an emailed invitation and
 * enrolls with their own account; seats are taken on acceptance. Billing stays the P0 manual invoice; discounts need approval. */
export async function GET() {
  try { requireEnabled("groupEnrollment"); const acc = await customer(); return NextResponse.json({groups: await groupsOf(acc.id), max: GROUP_MAX}, H); }
  catch (e) { return failure(e); }
}

export async function POST(req: NextRequest) {
  try {
    requireEnabled("registration"); requireEnabled("groupEnrollment"); assertSameOrigin(req);
    const acc = await customer();
    const x = schema.parse(await req.json());
    const emails = x.delegates.map(d => safeEmail(d.email));
    if (new Set(emails).size !== emails.length) throw new HttpError(400, "DUPLICATE_DELEGATE", "Each delegate needs a different email address.");
    const profile = await db.customerProfile.findUnique({where: {accountId: acc.id}});
    if (!profile?.fullName.trim()) throw new HttpError(400, "PROFILE_REQUIRED", "Complete your profile.");
    const conf = await db.conference.findFirst({where: {id: x.conferenceId, published: true, event: {published: true}}});
    if (!conf) throw new HttpError(404, "CONFERENCE_NOT_FOUND", "Conference not available.");
    const active = await db.enrollment.count({where: {conferenceId: conf.id, type: "CONFERENCE", status: {in: ACTIVE_CONFERENCE_STATUSES}}});
    const a = conferenceAvailability(conf.capacity, active, conf.feeMinor);
    if (a.registrationState === "NOT_READY") throw new HttpError(409, "CONFERENCE_NOT_READY", "Conference capacity or approved fee is not published yet.");
    if (a.registrationState === "FULL" || (a.remainingSeats !== null && a.remainingSeats < emails.length))
      throw new HttpError(409, "NOT_ENOUGH_SEATS", "Only " + (a.remainingSeats ?? 0) + " seats remain for this programme.");
    await expireStale();
    if (await db.invitation.count({where: {kind: "GROUP_DELEGATE", inviterAccountId: acc.id, status: "INVITED"}}) + emails.length > 100)
      throw new HttpError(429, "TOO_MANY_OPEN_INVITATIONS", "Too many open delegate invitations. Wait for delegates to respond.");
    const groupId = randomUUID();
    const org = profile.organization || profile.fullName;
    await createInvitations(x.delegates.map((d, i) => ({kind: "GROUP_DELEGATE", inviterAccountId: acc.id, groupId, conferenceId: conf.id, email: emails[i], fullName: d.fullName, tokenHash: "", expiresAt: new Date()})),
      "IMDX 2027 — conference delegate invitation", r => "Hello " + r.fullName + ",\n\n" + org + " registered you as a delegate for \"" + conf.title + "\" at IMDX 2027. Seats are confirmed by the organizer after review and manual payment.");
    await db.auditLog.create({data: {accountId: acc.id, action: "GROUP_REGISTRATION_CREATED", resourceType: "Conference", resourceId: conf.id, afterState: {groupId, delegates: emails.length}}});
    await db.notification.create({data: {audienceRole: "OPERATIONS", type: "GROUP_REGISTRATION", recordType: "Group", recordId: groupId}});
    return NextResponse.json({groupId, groups: await groupsOf(acc.id)}, {status: 201, ...H});
  } catch (e) { return failure(e); }
}
