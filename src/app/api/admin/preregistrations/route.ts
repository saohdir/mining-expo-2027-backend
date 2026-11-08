import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {requireEnabled} from "@/lib/policy";
import {hashToken, randomToken} from "@/lib/security";
import {sendMail} from "@/lib/mailer";
import {expireStale, INVITE_TTL_MS, inviteLink} from "@/lib/invitations";
import {validatePrereg} from "@/lib/preregistration";

const schema = z.object({eventCode: z.string().default("IMDX-2027"), csv: z.string().min(1).max(400000), dryRun: z.boolean().default(true), reason: z.string().min(8).max(500)}).strict();
const H = {headers: {"Cache-Control": "private,no-store"}};

/** FR-154 list: pre-registration invitations and their status. */
export async function GET() {
  try {
    requireEnabled("bulkTools");
    await admin(["SUPER_ADMIN", "OPERATIONS", "VIEWER"]);
    await expireStale();
    const rows = await db.invitation.findMany({where: {kind: "PREREGISTERED_VISITOR"}, orderBy: {createdAt: "desc"}, take: 2000, select: {id: true, email: true, fullName: true, status: true, createdAt: true, expiresAt: true, respondedAt: true}});
    return NextResponse.json({invitations: rows}, H);
  } catch (e) { return failure(e); }
}

/** FR-154: CSV pre-registration (dry-run first). Nobody gets an account or pass without acting: each person receives an
 * invitation, creates/signs in to their own account (accepting terms & privacy) and then receives their expo pass. */
export async function POST(req: NextRequest) {
  try {
    requireEnabled("bulkTools");
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const x = schema.parse(await req.json());
    const event = await db.event.findUnique({where: {code: x.eventCode}});
    if (!event) throw new HttpError(404, "NOT_FOUND", "Event not found.");
    const {rows, errors} = validatePrereg(x.csv);
    await expireStale();
    const emails = rows.map(r => r.email);
    const [registered, invited] = await Promise.all([
      db.enrollment.findMany({where: {eventId: event.id, type: "VISITOR", status: {notIn: ["CANCELLED", "REJECTED"]}, account: {email: {in: emails}}}, select: {account: {select: {email: true}}}}),
      db.invitation.findMany({where: {kind: "PREREGISTERED_VISITOR", eventId: event.id, status: {in: ["INVITED", "ACCEPTED"]}, email: {in: emails}}, select: {email: true}})
    ]);
    const reg = new Set(registered.map(r => r.account.email)), inv = new Set(invited.map(r => r.email));
    const skipped = rows.filter(r => reg.has(r.email) || inv.has(r.email)).map(r => ({line: r.line, email: r.email, reason: reg.has(r.email) ? "ALREADY_REGISTERED" : "ALREADY_INVITED"}));
    const todo = rows.filter(r => !reg.has(r.email) && !inv.has(r.email));
    const summary = {rows: rows.length + errors.length, valid: rows.length, toInvite: todo.length, skipped, errors};
    if (x.dryRun) return NextResponse.json({dryRun: true, ...summary}, H);
    if (errors.length) throw new HttpError(400, "CSV_HAS_ERRORS", "Fix the rows with errors (see dry run) before importing.");
    const failed: {line: number; email: string}[] = [];
    let sent = 0;
    for (const r of todo) {
      const token = randomToken();
      const row = await db.invitation.create({data: {kind: "PREREGISTERED_VISITOR", inviterAccountId: actor.id, eventId: event.id, email: r.email, fullName: r.fullName, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS)}});
      try {
        await sendMail(r.email, "IMDX 2027 — you are pre-registered", "Hello " + r.fullName + ",\n\nThe organizer pre-registered you as a visitor of " + event.title + (r.organization ? " (" + r.organization + ")" : "") +
          ".\nAccept within 7 days to receive your personal expo entry QR pass. You will sign in or create your account with this email address:\n" + inviteLink(token) + "\n\nIf you do not want to attend, ignore this email; no account is created.");
        sent++;
      } catch {
        await db.invitation.update({where: {id: row.id}, data: {status: "REVOKED", respondedAt: new Date()}});
        failed.push({line: r.line, email: r.email});
      }
    }
    await db.auditLog.create({data: {adminId: actor.id, action: "PREREGISTRATION_IMPORTED", resourceType: "Event", resourceId: event.id, afterState: {reason: x.reason, valid: rows.length, sent, failed: failed.length, skipped: skipped.length}}});
    return NextResponse.json({dryRun: false, ...summary, sent, failed}, H);
  } catch (e) { return failure(e); }
}
