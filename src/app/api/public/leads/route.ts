import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {failure, HttpError} from "@/lib/errors";
import {clientIpHash} from "@/lib/request-meta";
import {safeEmail} from "@/lib/security";
import {enqueueCrm} from "@/lib/crm-sync";

const schema = z.object({
  leadType: z.enum(["CONTACT", "PARTNER", "SPONSOR", "EXHIBITOR"]).default("CONTACT"),
  name: z.string().trim().min(2, "Enter your name").max(120), email: z.string().trim().email("Enter a valid email"),
  company: z.string().trim().max(180).optional(), phone: z.string().trim().max(40).optional(),
  message: z.string().trim().min(10, "Message must be at least 10 characters").max(3000),
  consent: z.literal(true, {errorMap: () => ({message: "Privacy consent is required"})}), consentVersion: z.string().max(40).default("v1.4-UAT"),
  utmSource: z.string().max(100).optional(), utmMedium: z.string().max(100).optional(), utmCampaign: z.string().max(100).optional(),
  website: z.string().max(200).optional()
}).strict();
const PER_IP_HOUR = Number(process.env.LEAD_IP_LIMIT_PER_HOUR || 5);

/** FR-010/024/026/027/028/030: contact/partnership lead. Consent required; honeypot + per-IP rate limit;
 * saved before notifying (outbox); UTM stored as optional attribution. Public endpoint returns a reference only. */
export async function POST(req: NextRequest) {
  try {
    const x = schema.parse(await req.json());
    const ipHash = clientIpHash(req);
    if (await db.lead.count({where: {ipHash, createdAt: {gte: new Date(Date.now() - 3600000)}}}) >= PER_IP_HOUR) throw new HttpError(429, "TOO_MANY_SUBMISSIONS", "Too many submissions. Please try again later.");
    if (x.website) return NextResponse.json({reference: "IMDX-L-" + Date.now().toString(36).toUpperCase(), message: "Thank you. Our team will contact you."}, {status: 201});
    const email = safeEmail(x.email);
    const dup = await db.lead.findFirst({where: {email, message: x.message, createdAt: {gte: new Date(Date.now() - 600000)}}});
    if (dup) return NextResponse.json({reference: "IMDX-L-" + dup.id.slice(0, 8).toUpperCase(), duplicate: true, message: "Your message was already received."}, {status: 200});
    const lead = await db.$transaction(async tx => {
      const l = await tx.lead.create({data: {leadType: x.leadType, name: x.name, email, company: x.company, phone: x.phone, message: x.message, consentVersion: x.consentVersion, consentAt: new Date(),
        utmSource: x.utmSource, utmMedium: x.utmMedium, utmCampaign: x.utmCampaign, ipHash}});
      await tx.notification.create({data: {audienceRole: "SALES", type: "LEAD_" + x.leadType, recordType: "Lead", recordId: l.id}});
      await tx.notificationOutbox.create({data: {topic: "LEAD_RECEIVED", dedupeKey: "lead:" + l.id, payload: {id: l.id}}});
      await enqueueCrm(tx, "LEAD", l.id, "created");
      return l;
    });
    return NextResponse.json({reference: "IMDX-L-" + lead.id.slice(0, 8).toUpperCase(), message: "Thank you. Our team will contact you."}, {status: 201, headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
