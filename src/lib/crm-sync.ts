import {createHmac} from "node:crypto";
import type {Prisma, PrismaClient} from "@prisma/client";

/** FR-032 (P2): optional CRM synchronisation through the outbox (idempotent, retried with backoff by the worker).
 * Disabled unless CRM_WEBHOOK_URL is set; only entities listed in CRM_SYNC_ENTITIES (default LEAD) are sent.
 * No third-party SDK: a signed JSON webhook the organizer's CRM/integration platform receives. */
export const CRM_ENTITIES = ["LEAD", "BOOTH_REQUEST", "ENROLLMENT"] as const;
export type CrmEntity = typeof CRM_ENTITIES[number];
export function crmEnabledFor(entity: CrmEntity) {
  if (!process.env.CRM_WEBHOOK_URL) return false;
  return (process.env.CRM_SYNC_ENTITIES || "LEAD").split(",").map(s => s.trim().toUpperCase()).includes(entity);
}
export async function enqueueCrm(tx: Prisma.TransactionClient, entity: CrmEntity, id: string, event: string) {
  if (!crmEnabledFor(entity)) return;
  await tx.notificationOutbox.create({data: {topic: "CRM_SYNC", dedupeKey: "crm:" + entity + ":" + id + ":" + event, payload: {entity, id, event}}});
}
/** Only https endpoints, except loopback when CRM_WEBHOOK_ALLOW_LOCAL_HTTP=true (local testing). */
export function crmTarget() {
  const raw = process.env.CRM_WEBHOOK_URL || "";
  let u: URL; try { u = new URL(raw); } catch { throw new Error("CRM_WEBHOOK_URL invalid"); }
  const local = ["127.0.0.1", "localhost", "::1"].includes(u.hostname);
  if (u.protocol !== "https:" && !(local && process.env.CRM_WEBHOOK_ALLOW_LOCAL_HTTP === "true")) throw new Error("CRM_WEBHOOK_URL must use https");
  return u;
}
export const crmSignature = (secret: string, timestamp: string, body: string) => "sha256=" + createHmac("sha256", secret).update(timestamp + "." + body).digest("hex");

/** Minimal, purpose-limited records (no notes, IP hashes, passwords or payment data). */
export async function crmRecord(db: PrismaClient, entity: CrmEntity, id: string) {
  if (entity === "LEAD") {
    const l = await db.lead.findUnique({where: {id}});
    return l && {type: l.leadType, name: l.name, email: l.email, company: l.company, phone: l.phone, message: l.message, status: l.status, consentVersion: l.consentVersion, consentAt: l.consentAt, utm: {source: l.utmSource, medium: l.utmMedium, campaign: l.utmCampaign}, createdAt: l.createdAt};
  }
  if (entity === "BOOTH_REQUEST") {
    const b = await db.boothRequest.findUnique({where: {id}, include: {account: {select: {email: true, profile: {select: {fullName: true, organization: true}}}}}});
    return b && {company: (b.companySnapshot as {name?: string}).name, contactName: b.account.profile?.fullName, email: b.account.email, organization: b.account.profile?.organization, requestedAreaSqm: Number(b.requestedAreaSqm), status: b.status, createdAt: b.createdAt};
  }
  const e = await db.enrollment.findUnique({where: {id}, include: {conference: {select: {title: true}}, account: {select: {email: true, profile: {select: {fullName: true, organization: true, jobTitle: true}}}}}});
  return e && {type: e.type, status: e.status, programme: e.conference?.title ?? null, email: e.account.email, name: e.account.profile?.fullName, organization: e.account.profile?.organization, jobTitle: e.account.profile?.jobTitle, createdAt: e.createdAt};
}

/** Worker step for topic CRM_SYNC. Throws on non-2xx so the outbox retries with backoff (max 5 attempts). */
export async function deliverCrm(db: PrismaClient, payload: {entity?: CrmEntity; id?: string; event?: string}, dedupeKey: string, fetcher: typeof fetch = fetch) {
  if (!payload.entity || !payload.id || !CRM_ENTITIES.includes(payload.entity)) throw new Error("Invalid CRM payload");
  const target = crmTarget(), secret = process.env.CRM_WEBHOOK_SECRET || "";
  if (secret.length < 32) throw new Error("CRM_WEBHOOK_SECRET missing/short");
  const record = await crmRecord(db, payload.entity, payload.id);
  const body = JSON.stringify({source: "imdx-2027", entity: payload.entity, event: payload.event, id: payload.id, deleted: !record, record: record ?? null, sentAt: new Date().toISOString()});
  const ts = String(Math.floor(Date.now() / 1000));
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetcher(target, {method: "POST", body, signal: ctrl.signal, redirect: "error", headers: {"Content-Type": "application/json", "Idempotency-Key": dedupeKey, "X-IMDX-Timestamp": ts, "X-IMDX-Signature": crmSignature(secret, ts, body)}});
    if (!r.ok) throw new Error("CRM responded " + r.status);
  } finally { clearTimeout(t); }
}
