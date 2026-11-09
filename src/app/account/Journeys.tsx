"use client";
import {participantComplete, type Participant} from "./ParticipantDetails";

type Me = Participant & {enrollments: {type: string; status: string}[]; requests: {status: string}[]};
type Step = {label: string; done: boolean};
type Journey = {key: string; tab: string; title: string; blurb: string; steps: Step[]; cta: string; status: string; tone: "todo" | "progress" | "done"};

function journeys(me: Me, hasExpoPass: boolean, invoices: {state: string}[]): Journey[] {
  const details = participantComplete(me);
  const visitor = me.enrollments.find(e => e.type === "VISITOR");
  const conf = me.enrollments.filter(e => e.type === "CONFERENCE");
  const confOk = conf.some(e => e.status === "CONFIRMED");
  const booth = me.requests[0];
  const b = booth?.status || "";
  const quoted = ["OFFERED", "ACCEPTED", "WAITING_INVOICE", "INVOICED", "ALLOCATION_PENDING", "CONFIRMED"].includes(b);
  const paying = ["ACCEPTED", "WAITING_INVOICE", "INVOICED", "ALLOCATION_PENDING", "CONFIRMED"].includes(b);
  const boothDone = b === "CONFIRMED";
  const tone = (steps: Step[]) => steps.every(s => s.done) ? "done" as const : steps.some(s => s.done) ? "progress" as const : "todo" as const;
  const v: Step[] = [{label: "Your details", done: details}, {label: "Register", done: !!visitor}, {label: "QR pass", done: hasExpoPass}];
  const c: Step[] = [{label: "Your details", done: details}, {label: "Choose programme", done: conf.length > 0}, {label: "Invoice & payment", done: confOk || invoices.some(i => i.state === "PAID_IN_FULL")}, {label: "Seat confirmed", done: confOk}];
  const e: Step[] = [{label: "Company & PIC", done: !!booth}, {label: "Booth request", done: !!booth}, {label: "Quotation", done: paying}, {label: "Payment", done: boothDone}, {label: "Booth confirmed", done: boothDone}];
  return [
    {key: "visit", tab: "visit", title: "Visit exhibition", blurb: "Free entry with a personal QR pass.", steps: v, tone: tone(v),
      status: hasExpoPass ? "Pass ready" : visitor ? "Registered" : details ? "Ready to register" : "Not started",
      cta: hasExpoPass ? "Show my QR pass" : !details ? "Complete my details" : "Register as visitor"},
    {key: "conference", tab: "conference", title: "Join conference", blurb: "Book a seat; paid seats are invoiced (bank transfer).", steps: c, tone: tone(c),
      status: confOk ? "Seat confirmed" : conf.length ? "Waiting for payment / review" : "Not booked",
      cta: confOk ? "View my conference" : conf.length ? "View invoice status" : "Explore programmes"},
    {key: "booth", tab: "booth", title: "Reserve booth", blurb: "Request booths on the floorplan; the organizer sends a quotation.", steps: e, tone: tone(e),
      status: boothDone ? "Booth confirmed" : b === "OFFERED" ? "Quotation waiting for you" : quoted ? "Payment in progress" : booth ? "Request under review" : "No request yet",
      cta: b === "OFFERED" ? "Review quotation" : booth ? "View my booth" : "Request a booth"}];
}

/** Overview: one card per journey with a step tracker and the single next action. */
export function Journeys({me, hasExpoPass, invoices, go}: {me: Me; hasExpoPass: boolean; invoices: {state: string}[]; go: (tab: string) => void}) {
  return <div className="journeys">
    {journeys(me, hasExpoPass, invoices).map(j => {
      const next = j.steps.findIndex(s => !s.done);
      return <article key={j.key} className={"journey journey-" + j.tone} aria-labelledby={"j-" + j.key}>
        <div className="journey-top"><h3 id={"j-" + j.key}>{j.title}</h3><span className={"journey-status " + j.tone}>{j.status}</span></div>
        <p className="journey-blurb">{j.blurb}</p>
        <ol className="journey-steps" aria-label={j.title + " progress"}>
          {j.steps.map((s, i) => <li key={s.label} className={s.done ? "done" : i === next ? "current" : ""} aria-current={i === next ? "step" : undefined}>
            <span className="dot" aria-hidden="true">{s.done ? "✓" : i + 1}</span><span>{s.label}</span></li>)}
        </ol>
        <button type="button" className={j.tone === "done" ? "ghost" : ""} onClick={() => go(j.tab)}>{j.cta} →</button>
      </article>;
    })}
  </div>;
}
