import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {customerPaymentState} from "@/lib/finance-ledger";
import {safeEmail} from "@/lib/security";

/** FR-120 drill-down: one customer's registrations, booth requests, invoices (amounts only for finance-capable roles). */
export async function GET(_req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "SALES", "FINANCE", "OPERATIONS"]);
    const {id} = await params; z.string().uuid().parse(id);
    const a = await db.customerAccount.findUnique({where: {id}, include: {profile: true,
      enrollments: {orderBy: {createdAt: "desc"}, include: {conference: {select: {title: true}}, passes: {select: {id: true, status: true, entitlement: true}}}},
      requests: {orderBy: {createdAt: "desc"}, select: {id: true, status: true, requestedAreaSqm: true, createdAt: true, assignments: {where: {active: true}, select: {boothUnit: {select: {code: true}}}}}},
      invoices: {orderBy: {createdAt: "desc"}, include: {transfers: true, adjustments: true}}}});
    if (!a) throw new HttpError(404, "NOT_FOUND", "Customer not found.");
    const money = ["SUPER_ADMIN", "SALES", "FINANCE"].includes(actor.role);
    return NextResponse.json({
      id: a.id, status: a.status, email: a.email, phone: money ? a.phone : null, verifiedEmailAt: a.verifiedEmailAt, verifiedPhoneAt: a.verifiedPhoneAt, createdAt: a.createdAt, profile: a.profile,
      enrollments: a.enrollments.map(e => ({id: e.id, type: e.type, status: e.status, conference: e.conference?.title || null, createdAt: e.createdAt, passes: e.passes})),
      requests: a.requests.map(r => ({...r, requestedAreaSqm: r.requestedAreaSqm.toString(), assigned: r.assignments.map(x => x.boothUnit.code)})),
      invoices: a.invoices.map(i => ({id: i.id, number: i.number, status: i.status, ...(money ? {totalMinor: i.totalMinor.toString(), summary: customerPaymentState(i, i.transfers, i.adjustments)} : {})}))
    }, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}

const correction = z.object({fullName: z.string().trim().min(2).max(120).optional(), organization: z.string().trim().max(180).nullable().optional(), jobTitle: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().max(100).nullable().optional(), email: z.string().email().optional(), reason: z.string().trim().min(10).max(400)}).strict();
/** FR-153 admin correction with mandatory reason. Booking snapshots and QR tokens are never edited.
 * Email correction (SUPER_ADMIN only) clears verification and signs the customer out to force re-verification. */
export async function PATCH(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params; z.string().uuid().parse(id);
    const x = correction.parse(await req.json());
    if (x.email && actor.role !== "SUPER_ADMIN") throw new HttpError(403, "FORBIDDEN", "Only Super Admin may correct a sign-in email.");
    const out = await db.$transaction(async tx => {
      const acc = await tx.customerAccount.findUnique({where: {id}, include: {profile: true}});
      if (!acc || !acc.profile) throw new HttpError(404, "NOT_FOUND", "Customer not found.");
      const {reason, email, ...profile} = x;
      const p = await tx.customerProfile.update({where: {accountId: id}, data: profile});
      if (email) {
        const e = safeEmail(email);
        if (await tx.customerAccount.count({where: {email: e, id: {not: id}}})) throw new HttpError(409, "CONTACT_UNAVAILABLE", "Email belongs to another account.");
        await tx.customerAccount.update({where: {id}, data: {email: e, verifiedEmailAt: null}});
        await tx.customerSession.updateMany({where: {accountId: id, revokedAt: null}, data: {revokedAt: new Date()}});
      }
      await tx.auditLog.create({data: {adminId: actor.id, action: "CUSTOMER_CORRECTED", resourceType: "CustomerAccount", resourceId: id,
        beforeState: {fullName: acc.profile.fullName, organization: acc.profile.organization, jobTitle: acc.profile.jobTitle, country: acc.profile.country, emailChanged: false},
        afterState: {fullName: p.fullName, organization: p.organization, jobTitle: p.jobTitle, country: p.country, emailChanged: !!email, reason}}});
      return {id, profile: p, emailReverificationRequired: !!email};
    });
    return NextResponse.json(out, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
