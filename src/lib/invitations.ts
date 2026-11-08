import {Prisma} from "@prisma/client";
import {db} from "./db";
import {HttpError} from "./errors";
import {hashToken, randomToken, safeEmail, sealToken} from "./security";
import {shortCodeFor, shortCodeHash} from "./pass-code";
import {sendMail} from "./mailer";
import {ACTIVE_CONFERENCE_STATUSES, conferenceAvailability} from "./conference-capacity";

/** FR-156 (exhibitor booth representatives) and FR-059 (group delegate enrollment).
 * An invitation is a single-use emailed link (only its SHA-256 hash is stored). The invitee signs in or creates
 * their own account with the invited email, so every person keeps an individual account, profile and pass. */
export const INVITE_TTL_MS = 7 * 86400000;
export const staffLimit = () => { const n = Number(process.env.EXHIBITOR_STAFF_LIMIT || 5); return Number.isInteger(n) && n > 0 && n <= 100 ? n : 5; };
export const GROUP_MAX = 25;
const portal = () => (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
const OPEN = ["INVITED", "ACCEPTED"];

type Tx = Prisma.TransactionClient;
export async function expireStale(tx: Tx | typeof db = db) {
  await tx.invitation.updateMany({where: {status: "INVITED", expiresAt: {lt: new Date()}}, data: {status: "EXPIRED"}});
}

/** Creates invitations and emails the links. On mail failure the invitation is revoked so no dead seat is held. */
export async function createInvitations(rows: Prisma.InvitationUncheckedCreateInput[], subject: string, intro: (r: {fullName: string}) => string) {
  const tokens = rows.map(() => randomToken());
  const created = await db.$transaction(rows.map((r, i) => db.invitation.create({data: {...r, email: safeEmail(r.email), tokenHash: hashToken(tokens[i]), expiresAt: new Date(Date.now() + INVITE_TTL_MS)}})));
  for (let i = 0; i < created.length; i++) {
    const link = portal() + "/account/invitation?token=" + encodeURIComponent(tokens[i]);
    try {
      await sendMail(created[i].email, subject, intro(created[i]) + "\n\nAccept the invitation (valid 7 days, sign in or create your account with this email address):\n" + link +
        "\n\nIf you did not expect this, ignore this email.");
    } catch {
      await db.invitation.update({where: {id: created[i].id}, data: {status: "REVOKED", respondedAt: new Date()}});
      throw new HttpError(502, "EMAIL_FAILED", "Invitation email could not be sent to " + created[i].email + ". Try again later.");
    }
  }
  return created;
}

export async function findByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new HttpError(404, "INVITATION_NOT_FOUND", "Invitation link is invalid.");
  await expireStale();
  const inv = await db.invitation.findUnique({where: {tokenHash: hashToken(token)}});
  if (!inv) throw new HttpError(404, "INVITATION_NOT_FOUND", "Invitation link is invalid.");
  return inv;
}

export const maskEmail = (e: string) => e.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + "*".repeat(Math.min(6, b.length)) + c);

/** Public preview: no personal data beyond a masked email and the inviting company / programme name. */
export async function previewInvitation(token: string) {
  const inv = await findByToken(token);
  const booth = inv.boothRequestId ? await db.boothRequest.findUnique({where: {id: inv.boothRequestId}, select: {companySnapshot: true}}) : null;
  const conf = inv.conferenceId ? await db.conference.findUnique({where: {id: inv.conferenceId}, select: {title: true, startsAt: true}}) : null;
  const company = (booth?.companySnapshot as {name?: string} | null);
  return {kind: inv.kind, status: inv.status, email: maskEmail(inv.email), fullName: inv.fullName, expiresAt: inv.expiresAt,
    company: company?.name || null, programme: conf?.title || null, programmeStartsAt: conf?.startsAt || null};
}

async function issueExpoPass(tx: Tx, accountId: string, enrollmentId: string, eventId: string, endsAt: Date) {
  if (await tx.eventPass.count({where: {accountId, eventId, status: "ACTIVE", entitlement: "EXPO_ENTRY"}})) return false;
  const token = randomToken();
  await tx.eventPass.create({data: {accountId, enrollmentId, eventId, tokenHash: hashToken(token), shortCodeHash: shortCodeHash(shortCodeFor(token)), encryptedToken: sealToken(token), expiresAt: endsAt, entitlement: "EXPO_ENTRY"}});
  return true;
}

/** Accept as the signed-in customer. The account email must equal the invited email (prevents link forwarding). */
export async function acceptInvitation(token: string, account: {id: string; email: string | null}) {
  const inv = await findByToken(token);
  if (inv.status !== "INVITED") throw new HttpError(409, "INVITATION_" + inv.status, "This invitation is " + inv.status.toLowerCase() + ".");
  if (!account.email || safeEmail(account.email) !== inv.email) throw new HttpError(403, "INVITATION_EMAIL_MISMATCH", "Sign in with the email address the invitation was sent to.");
  if (inv.inviterAccountId === account.id && inv.kind === "EXHIBITOR_STAFF") throw new HttpError(409, "SELF_INVITE", "The booth owner already has access.");
  const profile = await db.customerProfile.findUnique({where: {accountId: account.id}});
  if (!profile?.fullName.trim()) throw new HttpError(400, "PROFILE_REQUIRED", "Complete your profile first.");
  const snapshot = {fullName: profile.fullName, organization: profile.organization, jobTitle: profile.jobTitle};
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const fresh = await tx.invitation.findUniqueOrThrow({where: {id: inv.id}});
        if (fresh.status !== "INVITED") throw new HttpError(409, "INVITATION_" + fresh.status, "This invitation is no longer open.");
        let enrollmentId: string;
        if (inv.kind === "EXHIBITOR_STAFF") {
          const booth = await tx.boothRequest.findUniqueOrThrow({where: {id: inv.boothRequestId!}, include: {event: true}});
          if (booth.status !== "CONFIRMED") throw new HttpError(409, "BOOTH_NOT_CONFIRMED", "The exhibitor booking is not confirmed.");
          const e = await tx.enrollment.create({data: {accountId: account.id, eventId: booth.eventId, type: "VISITOR", status: "CONFIRMED", confirmedAt: new Date(), consentAt: new Date(),
            profileSnapshot: {...snapshot, role: "EXHIBITOR_STAFF", boothRequestId: booth.id, invitationId: inv.id}}});
          await issueExpoPass(tx, account.id, e.id, booth.eventId, booth.event.endsAt);
          await tx.notificationOutbox.create({data: {topic: "PASS_READY", dedupeKey: "pass-ready:" + e.id, payload: {enrollmentId: e.id}}});
          enrollmentId = e.id;
        } else {
          const conf = await tx.conference.findUniqueOrThrow({where: {id: inv.conferenceId!}});
          if (!conf.published) throw new HttpError(409, "CONFERENCE_NOT_FOUND", "Programme is no longer available.");
          if (await tx.enrollment.count({where: {accountId: account.id, conferenceId: conf.id, type: "CONFERENCE", status: {notIn: ["CANCELLED", "REJECTED"]}}}))
            throw new HttpError(409, "ALREADY_REGISTERED", "You are already registered for this programme.");
          const active = await tx.enrollment.count({where: {conferenceId: conf.id, type: "CONFERENCE", status: {in: ACTIVE_CONFERENCE_STATUSES}}});
          const state = conferenceAvailability(conf.capacity, active, conf.feeMinor).registrationState;
          if (state === "FULL") throw new HttpError(409, "CONFERENCE_FULL", "No seats remain for this programme. Ask your coordinator to contact the organizer.");
          if (state === "NOT_READY") throw new HttpError(409, "CONFERENCE_NOT_READY", "Programme registration is not open.");
          const e = await tx.enrollment.create({data: {accountId: account.id, eventId: conf.eventId, conferenceId: conf.id, type: "CONFERENCE", status: "SUBMITTED", groupId: inv.groupId, consentAt: new Date(),
            profileSnapshot: {...snapshot, role: "GROUP_DELEGATE", groupId: inv.groupId, invitationId: inv.id}}});
          enrollmentId = e.id;
        }
        await tx.invitation.update({where: {id: inv.id}, data: {status: "ACCEPTED", acceptedAccountId: account.id, enrollmentId, respondedAt: new Date()}});
        await tx.auditLog.create({data: {accountId: account.id, action: "INVITATION_ACCEPTED", resourceType: "Invitation", resourceId: inv.id, afterState: {kind: inv.kind, enrollmentId}}});
        return {kind: inv.kind, enrollmentId};
      }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
    } catch (e) {
      if (attempt < 2 && typeof e === "object" && e && (e as {code?: string}).code === "P2034") continue;
      throw e;
    }
  }
}

/** Revoke: an open invitation is closed; an accepted booth representative loses the pass issued by it. */
export async function revokeInvitation(tx: Tx, id: string, reason: string) {
  const inv = await tx.invitation.findUniqueOrThrow({where: {id}});
  if (!OPEN.includes(inv.status)) return inv;
  if (inv.status === "ACCEPTED" && inv.enrollmentId) {
    await tx.enrollment.update({where: {id: inv.enrollmentId}, data: {status: "CANCELLED"}});
    await tx.eventPass.updateMany({where: {enrollmentId: inv.enrollmentId, status: "ACTIVE"}, data: {status: "REVOKED", revokedAt: new Date(), revokeReason: reason}});
  }
  return tx.invitation.update({where: {id}, data: {status: "REVOKED", respondedAt: new Date()}});
}
export const OPEN_INVITE_STATUSES = OPEN;

/** FR-156: when a booth booking leaves CONFIRMED, all its representatives lose access. */
export async function revokeBoothStaff(tx: Tx, boothRequestId: string, reason: string) {
  const open = await tx.invitation.findMany({where: {kind: "EXHIBITOR_STAFF", boothRequestId, status: {in: OPEN}}, select: {id: true}});
  for (const i of open) await revokeInvitation(tx, i.id, reason);
  return open.length;
}

/** FR-059 coordinator view: delegates per group with invitation and registration status. */
export async function groupsOf(accountId: string) {
  await expireStale();
  const rows = await db.invitation.findMany({where: {kind: "GROUP_DELEGATE", inviterAccountId: accountId}, orderBy: {createdAt: "asc"}});
  const enr = await db.enrollment.findMany({where: {id: {in: rows.map(r => r.enrollmentId).filter((x): x is string => !!x)}}, select: {id: true, status: true}});
  const confs = await db.conference.findMany({where: {id: {in: [...new Set(rows.map(r => r.conferenceId!))]}}, select: {id: true, title: true}});
  const groups = new Map<string, {groupId: string; programme: string; createdAt: Date; delegates: unknown[]}>();
  for (const r of rows) {
    const g = groups.get(r.groupId!) ?? {groupId: r.groupId!, programme: confs.find(c => c.id === r.conferenceId)?.title || "", createdAt: r.createdAt, delegates: []};
    g.delegates.push({id: r.id, fullName: r.fullName, email: r.email, invitation: r.status, registration: enr.find(e => e.id === r.enrollmentId)?.status || null, expiresAt: r.expiresAt});
    groups.set(r.groupId!, g);
  }
  return [...groups.values()].reverse();
}

