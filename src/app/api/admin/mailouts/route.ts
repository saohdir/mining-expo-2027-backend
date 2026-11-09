import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {mailoutsEnabled, recipientIds, SEGMENTS, type Segment} from "@/lib/mailouts";

const H = {headers: {"Cache-Control": "private,no-store"}};
const need = () => { if (!mailoutsEnabled()) throw new HttpError(503, "NOT_ENABLED", "Scheduled mailouts require ENABLE_SCHEDULED_MAILOUTS and organizer approval."); };
/** FR-154: list mailouts; ?segment=…&conferenceId=… previews the current recipient count. */
export async function GET(req: NextRequest) {
  try {
    need(); await admin(["SUPER_ADMIN", "OPERATIONS", "SALES", "VIEWER"]);
    const seg = req.nextUrl.searchParams.get("segment");
    if (seg) { const s = z.enum(SEGMENTS).parse(seg); return NextResponse.json({segment: s, recipients: (await recipientIds(db, s, req.nextUrl.searchParams.get("conferenceId"))).length}, H); }
    return NextResponse.json({mailouts: await db.mailout.findMany({orderBy: {createdAt: "desc"}, take: 100})}, H);
  } catch (e) { return failure(e); }
}
const schema = z.object({subject: z.string().trim().min(5).max(150), body: z.string().trim().min(20).max(10000), segment: z.enum(SEGMENTS),
  conferenceId: z.string().uuid().nullable().optional(), sendAt: z.string().datetime({offset: true})}).strict();
export async function POST(req: NextRequest) {
  try {
    need(); const actor = await admin(["SUPER_ADMIN", "OPERATIONS", "SALES"]);
    const x = schema.parse(await req.json());
    if (x.segment === "PROGRAMME" && !x.conferenceId) throw new HttpError(400, "PROGRAMME_REQUIRED", "Choose the programme.");
    const sendAt = new Date(x.sendAt);
    if (sendAt.getTime() < Date.now() + 60000) throw new HttpError(400, "SEND_AT_PAST", "Schedule at least one minute ahead.");
    const m = await db.mailout.create({data: {subject: x.subject, body: x.body, segment: x.segment, conferenceId: x.segment === "PROGRAMME" ? x.conferenceId : null, sendAt, createdBy: actor.id,
      recipients: (await recipientIds(db, x.segment as Segment, x.conferenceId)).length}});
    await db.auditLog.create({data: {adminId: actor.id, action: "MAILOUT_DRAFTED", resourceType: "Mailout", resourceId: m.id, afterState: {segment: m.segment, sendAt: m.sendAt, recipients: m.recipients}}});
    return NextResponse.json({mailout: m, message: "Draft saved. A second staff member must approve it before it is sent."}, {status: 201, ...H});
  } catch (e) { return failure(e); }
}
