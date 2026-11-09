"use client";
import {useEffect, useState} from "react";
import {participantComplete, type Participant} from "./ParticipantDetails";

type Me = Participant & {
  verifiedPhoneAt?: string | null;
  enrollments: {type: string; status: string}[];
  requests: {status: string; offers?: {acceptedAt: string | null}[]}[];
};
type Item = {key: string; label: string; done: boolean; tab: string; hint?: string};

/** Event preparation checklist built only from data the portal already loads (no new API): details, WhatsApp, visitor pass,
 * conference seat, booth quotation/confirmation and invoices. Items for journeys the customer has not started stay out. */
export function prepItems(me: Me, hasExpoPass: boolean, invoices: {number: string; state: string; dueAt?: string | null}[]): Item[] {
  const items: Item[] = [
    {key: "details", label: "Complete your participant details", done: participantComplete(me), tab: "profile"},
    {key: "phone", label: "Verify your WhatsApp number", done: Boolean(me.verifiedPhoneAt), tab: "profile"},
    {key: "visitor", label: "Register as exhibition visitor", done: me.enrollments.some(e => e.type === "VISITOR"), tab: "visit"},
    {key: "pass", label: "Receive your QR pass", done: hasExpoPass, tab: "visit"}
  ];
  const conf = me.enrollments.filter(e => e.type === "CONFERENCE");
  if (conf.length) items.push({key: "seat", label: "Conference seat confirmed", done: conf.some(e => e.status === "CONFIRMED"), tab: "conference"});
  const booth = me.requests[0];
  if (booth) {
    const accepted = Boolean(booth.offers?.[0]?.acceptedAt) || ["ACCEPTED", "WAITING_INVOICE", "INVOICED", "ALLOCATION_PENDING", "CONFIRMED"].includes(booth.status);
    items.push({key: "quote", label: "Accept your booth quotation", done: accepted, tab: "booth"});
    items.push({key: "booth", label: "Booth confirmed", done: booth.status === "CONFIRMED", tab: "booth"});
  }
  const open = invoices.filter(i => ["AWAITING_PAYMENT", "DP_RECEIVED"].includes(i.state));
  if (invoices.length) items.push({key: "paid", label: open.length ? `Pay ${open.length === 1 ? "invoice " + open[0].number : open.length + " invoices"}` : "All invoices paid",
    done: !open.length, tab: "payments",
    hint: open.length === 1 && open[0].dueAt ? "Due " + new Date(open[0].dueAt).toLocaleDateString("en-GB", {timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric"}) : undefined});
  return items;
}

export function PrepChecklist({items, go}: {items: Item[]; go: (tab: string) => void}) {
  const done = items.filter(i => i.done).length;
  return <section className="portal-card prep" aria-labelledby="prep-h">
    <div className="portal-card-head"><h2 id="prep-h">Event preparation</h2><span className="micro" aria-live="polite">{done} of {items.length} done</span></div>
    <div className="prep-bar" role="progressbar" aria-label="Event preparation progress" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done}>
      <span style={{width: (items.length ? done / items.length * 100 : 0) + "%"}}/></div>
    <ul className="prep-list">{items.map(i => <li key={i.key} className={i.done ? "done" : ""}>
      <span className="prep-dot" aria-hidden="true">{i.done ? "✓" : ""}</span>
      <span className="prep-label">{i.label}<span className="sr-only">{i.done ? " (done)" : " (to do)"}</span></span>
      {i.done ? <span className="micro">Done</span> : <button type="button" className="link" onClick={() => go(i.tab)}>{i.hint || "Open"} →</button>}
    </li>)}</ul>
  </section>;
}

type Update = {label: string; kind: string; reference: string; at: string};
/** Account updates in the portal (customer-safe audit timeline that already powers "Account activity"). */
export function RecentUpdates({go}: {go: (tab: string) => void}) {
  const [rows, setRows] = useState<Update[] | null>(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/customer/timeline", {cache: "no-store"}).then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { if (live) setRows((d.events || []).filter((e: Update) => e.label !== "Signed in").slice(0, 6)); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);
  return <section className="portal-card updates" aria-labelledby="upd-h">
    <div className="portal-card-head"><h2 id="upd-h">Recent updates</h2><button type="button" className="link" onClick={() => go("profile")}>All activity →</button></div>
    {failed ? <p className="micro" role="status">Updates are unavailable right now. Please refresh the page.</p>
      : !rows ? <ul className="updates-list" aria-busy="true">{[0, 1, 2].map(i => <li key={i} className="skeleton"/>)}</ul>
      : !rows.length ? <p className="micro">No updates yet. Registrations, quotations, invoices and payment checks will appear here.</p>
      : <ul className="updates-list">{rows.map((r, i) => <li key={i}><strong>{r.label}</strong>
        <span className="micro">{new Date(r.at).toLocaleString("en-GB", {timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"})} WIB · ref. {r.reference}</span></li>)}</ul>}
  </section>;
}
