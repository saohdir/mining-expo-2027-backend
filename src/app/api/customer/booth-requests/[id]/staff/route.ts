import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {customer} from "@/lib/auth";
import {db} from "@/lib/db";
import {failure, HttpError} from "@/lib/errors";
import {requireEnabled} from "@/lib/policy";
import {assertSameOrigin} from "@/lib/customer-auth";
import {safeEmail} from "@/lib/security";
import {createInvitations, expireStale, OPEN_INVITE_STATUSES, staffLimit} from "@/lib/invitations";

const schema = z.object({email: z.string().email().max(200), fullName: z.string().trim().min(2).max(120)}).strict();
const H = {headers: {"Cache-Control": "private,no-store"}};

async function ownBooth(id: string, accountId: string) {
  const b = await db.boothRequest.findFirst({where: {id, accountId}});
  if (!b) throw new HttpError(404, "NOT_FOUND", "Booking not found.");
  return b;
}
async function list(boothRequestId: string) {
  await expireStale();
  const rows = await db.invitation.findMany({where: {kind: "EXHIBITOR_STAFF", boothRequestId}, orderBy: {createdAt: "desc"},
    select: {id: true, email: true, fullName: true, status: true, expiresAt: true, createdAt: true, respondedAt: true}});
  return {limit: staffLimit(), used: rows.filter(r => OPEN_INVITE_STATUSES.includes(r.status)).length, staff: rows};
}

/** FR-156: booth representatives of a confirmed exhibitor booking (individual accounts + expo QR). */
export async function GET(_: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    requireEnabled("exhibitorStaff");
    const acc = await customer(); const {id} = await params;
    const b = await ownBooth(id, acc.id);
    return NextResponse.json({boothStatus: b.status, ...(await list(b.id))}, H);
  } catch (e) { return failure(e); }
}

export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    requireEnabled("exhibitorStaff"); assertSameOrigin(req);
    const acc = await customer(); const {id} = await params;
    const x = schema.parse(await req.json());
    const b = await ownBooth(id, acc.id);
    if (b.status !== "CONFIRMED") throw new HttpError(409, "BOOTH_NOT_CONFIRMED", "Representatives can be invited once the booth booking is confirmed.");
    const email = safeEmail(x.email);
    if (acc.email && safeEmail(acc.email) === email) throw new HttpError(409, "SELF_INVITE", "You already have access as the booth owner.");
    await expireStale();
    const open = await db.invitation.findMany({where: {kind: "EXHIBITOR_STAFF", boothRequestId: b.id, status: {in: OPEN_INVITE_STATUSES}}, select: {email: true}});
    if (open.some(o => o.email === email)) throw new HttpError(409, "ALREADY_INVITED", "This person is already invited.");
    if (open.length >= staffLimit()) throw new HttpError(409, "STAFF_LIMIT_REACHED", "The representative limit for this booth (" + staffLimit() + ") is reached.");
    const company = (b.companySnapshot as {name?: string}).name || "an exhibitor";
    const [inv] = await createInvitations([{kind: "EXHIBITOR_STAFF", inviterAccountId: acc.id, boothRequestId: b.id, email, fullName: x.fullName, tokenHash: "", expiresAt: new Date()}],
      "IMDX 2027 — booth representative invitation", r => "Hello " + r.fullName + ",\n\n" + company + " invited you as a booth representative at IMDX 2027. You will receive your own expo entry QR pass.");
    await db.auditLog.create({data: {accountId: acc.id, action: "EXHIBITOR_STAFF_INVITED", resourceType: "BoothRequest", resourceId: b.id, afterState: {invitationId: inv.id}}});
    return NextResponse.json(await list(b.id), {status: 201, ...H});
  } catch (e) { return failure(e); }
}
