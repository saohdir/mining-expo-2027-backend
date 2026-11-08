import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {customer} from "@/lib/auth";
import {failure} from "@/lib/errors";

/** Customer-safe activity timeline (FR-118/143/148): own records only, friendly labels,
 * no staff identity, no internal notes or before/after payloads. */
const LABEL: Record<string, string> = {
  CUSTOMER_REGISTERED: "Account verified", CUSTOMER_SIGNED_IN: "Signed in", CUSTOMER_PROFILE_UPDATED: "Profile updated", CUSTOMER_CONTACT_CHANGED: "Contact details changed",
  ENROLLMENT_REVIEW: "Registration reviewed", CONFERENCE_CONFIRMED_ON_FULL_PAYMENT: "Conference confirmed after full payment", CONFERENCE_ACCESS_SUSPENDED: "Conference access suspended (payment corrected)",
  BOOTH_STATUS_CHANGED: "Booth request status updated", BOOTH_REQUEST_SUBMITTED: "Booth request submitted", REGISTRATION_SUBMITTED: "Registration submitted", BOOTH_OFFER_PROPOSED: "Quotation issued", BOOTH_OFFER_ACCEPTED: "Quotation accepted",
  BOOTH_HOLD_CREATED: "Booth temporarily held by organizer", BOOTH_HOLD_RELEASED: "Temporary hold released", BOOTH_ASSIGNED: "Booth assigned",
  INVOICE_ISSUED: "Invoice issued", INVOICE_EMAIL_QUEUED: "Invoice sent by email", INVOICE_WHATSAPP_LINK_CREATED: "Invoice shared via WhatsApp",
  BANK_TRANSFER_VERIFIED: "Payment verified by Finance", BANK_TRANSFER_APPROVED: "Payment verified by Finance", PAYMENT_REVERSAL: "Payment record corrected",
  PAYMENT_REFUND: "Refund recorded", INVOICE_CANCELLED: "Invoice cancelled", PAYMENT_PROOF_SUBMITTED: "Transfer proof submitted", PAYMENT_PROOF_REJECTED: "Transfer proof not matched",
  PASS_REVOKED: "Event pass revoked", PASS_REISSUED: "New event pass issued"
};
export async function GET() {
  try {
    const acc = await customer();
    const [enrollments, requests, invoices] = await Promise.all([
      db.enrollment.findMany({where: {accountId: acc.id}, select: {id: true}}),
      db.boothRequest.findMany({where: {accountId: acc.id}, select: {id: true}}),
      db.invoice.findMany({where: {accountId: acc.id, status: {not: "DRAFT"}}, select: {id: true, transfers: {select: {id: true}}}})]);
    const passes = await db.eventPass.findMany({where: {accountId: acc.id}, select: {id: true}});
    const ids = [acc.id, ...enrollments.map(x => x.id), ...requests.map(x => x.id), ...invoices.flatMap(i => [i.id, ...i.transfers.map(t => t.id)]), ...passes.map(p => p.id)];
    const rows = await db.auditLog.findMany({where: {resourceId: {in: ids}, action: {in: Object.keys(LABEL)}}, orderBy: {createdAt: "desc"}, take: 200,
      select: {action: true, resourceType: true, resourceId: true, createdAt: true}});
    return NextResponse.json({events: rows.map(r => ({label: LABEL[r.action], kind: r.resourceType, reference: r.resourceId.slice(0, 8), at: r.createdAt}))}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
