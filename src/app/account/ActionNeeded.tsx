"use client";
import type {CustomerInvoice} from "./InvoicePanel";

type Me = {profile?: {fullName?: string; organization?: string | null} | null; requests?: {id: string; status: string; offers?: {acceptedAt: string | null; expiresAt: string | null}[]}[]; enrollments?: {type: string; status: string}[]};
/** FR-119 aggregate "action needed" banners derived only from server state (AT-084). */
export function ActionNeeded({me, invoices, go}: {me: Me; invoices: CustomerInvoice[]; go: (tab: string) => void}) {
  const items: {text: string; tab: string; urgent?: boolean}[] = [];
  for (const r of me.requests || []) {
    const o = r.offers?.[0];
    if (r.status === "OFFERED" && o && !o.acceptedAt && (!o.expiresAt || new Date(o.expiresAt) > new Date())) items.push({text: "A booth quotation is waiting for your review.", tab: "booth"});
  }
  for (const i of invoices) {
    if (i.overdue) items.push({text: `Invoice ${i.number} is overdue.`, tab: "payments", urgent: true});
    else if (["AWAITING_PAYMENT", "DP_RECEIVED"].includes(i.state)) items.push({text: `Invoice ${i.number} has an outstanding balance.`, tab: "payments"});
    if (i.proofs?.some(p => p.status === "REJECTED")) items.push({text: `A transfer proof for ${i.number} could not be matched.`, tab: "payments", urgent: true});
  }
  if ((me.enrollments || []).some(e => e.type === "CONFERENCE" && ["SUBMITTED", "PENDING_REVIEW"].includes(e.status)) && !invoices.length)
    items.push({text: "Your conference booking needs an invoice — request manual bank transfer from the Conferences tab.", tab: "conference"});
  if (!me.profile?.organization) items.push({text: "Add your company to your profile.", tab: "profile"});
  if (!items.length) return <p className="micro" role="status">No action needed right now.</p>;
  return <div className="action-needed" role="region" aria-label="Action needed">
    <h2>Action needed</h2>
    <ul>{items.map((x, i) => <li key={i} className={x.urgent ? "warning" : undefined}>{x.text} <button type="button" className="link" onClick={() => go(x.tab)}>Open</button></li>)}</ul>
  </div>;
}
