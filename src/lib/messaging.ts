import type {PrismaClient} from "@prisma/client";

/** FR-158 (P2): outbound WhatsApp automation through the official WhatsApp Business Cloud API, using a
 * pre-approved message TEMPLATE (business-initiated messages must be templates). Strictly opt-in: only for
 * customers who chose WhatsApp updates AND verified their phone. Email remains the system of record.
 * Off unless ENABLE_MESSAGING_AUTOMATION=true and WHATSAPP_PROVIDER=meta with credentials. */
export function whatsappConfigured() {
  return process.env.ENABLE_MESSAGING_AUTOMATION === "true" && process.env.WHATSAPP_PROVIDER === "meta" &&
    Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_TEMPLATE_NAME);
}
/** E.164 digits only (WhatsApp API wants no '+'). */
export const waNumber = (phone: string) => { const d = phone.replace(/[^\d]/g, ""); return /^[1-9]\d{7,14}$/.test(d) ? d : null; };

/** Called by the worker after a customer email was delivered: queue a WhatsApp copy for opted-in customers. */
export async function queueWhatsAppCopy(db: PrismaClient, email: string, subject: string, link: string, sourceKey: string) {
  if (!whatsappConfigured() || !sourceKey) return false;
  const acc = await db.customerAccount.findUnique({where: {email}, select: {id: true, phone: true, verifiedPhoneAt: true, profile: {select: {notifyChannel: true, fullName: true}}}});
  if (!acc?.phone || !acc.verifiedPhoneAt || acc.profile?.notifyChannel !== "WHATSAPP") return false;
  await db.notificationOutbox.upsert({where: {dedupeKey: "wa:" + sourceKey}, update: {},
    create: {topic: "WHATSAPP_SEND", dedupeKey: "wa:" + sourceKey, payload: {accountId: acc.id, params: [acc.profile.fullName || "participant", subject.replace(/^IMDX( 2027)? — /, "").slice(0, 120), link]}}});
  return true;
}

/** Worker step for WHATSAPP_SEND. Re-checks consent at send time; throws on provider error so the outbox retries. */
export async function deliverWhatsApp(db: PrismaClient, payload: {accountId?: string; params?: string[]}, fetcher: typeof fetch = fetch) {
  if (!whatsappConfigured()) throw new Error("WhatsApp automation not configured");
  const acc = payload.accountId ? await db.customerAccount.findUnique({where: {id: payload.accountId}, select: {phone: true, verifiedPhoneAt: true, profile: {select: {notifyChannel: true}}}}) : null;
  if (!acc?.phone || !acc.verifiedPhoneAt || acc.profile?.notifyChannel !== "WHATSAPP") return "SKIPPED_NO_CONSENT";
  const to = waNumber(acc.phone); if (!to) return "SKIPPED_BAD_NUMBER";
  const base = (process.env.WHATSAPP_API_BASE || "https://graph.facebook.com").replace(/\/$/, ""), version = process.env.WHATSAPP_API_VERSION || "v21.0";
  const r = await fetcher(`${base}/${version}/${encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID!)}/messages`, {method: "POST", redirect: "error",
    headers: {"Authorization": "Bearer " + process.env.WHATSAPP_ACCESS_TOKEN, "Content-Type": "application/json"},
    body: JSON.stringify({messaging_product: "whatsapp", to, type: "template", template: {name: process.env.WHATSAPP_TEMPLATE_NAME, language: {code: process.env.WHATSAPP_TEMPLATE_LANG || "en"},
      components: [{type: "body", parameters: (payload.params || []).slice(0, 3).map(text => ({type: "text", text: String(text).slice(0, 200)}))}]}})});
  if (!r.ok) throw new Error("WhatsApp provider responded " + r.status);
  return "SENT";
}
