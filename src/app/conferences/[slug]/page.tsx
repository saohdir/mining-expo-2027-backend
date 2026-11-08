import type {Metadata} from "next";
import {notFound} from "next/navigation";
import {publicConferences, wib, idr} from "@/lib/public-conferences";
export const dynamic = "force-dynamic";

async function load(slug: string) { const d = await publicConferences(); return d ? {event: d.event, c: d.conferences.find(x => x.slug === slug)} : null; }
export async function generateMetadata({params}: {params: Promise<{slug: string}>}): Promise<Metadata> {
  const d = await load((await params).slug);
  if (!d?.c) return {title: "Conference | IMDX 2027"};
  return {title: d.c.title + " | IMDX 2027", description: d.c.description.en?.summary || d.c.title + " at IMDX 2027, JIEXPO Jakarta.", alternates: {canonical: "/conferences/" + d.c.slug},
    openGraph: {title: d.c.title, type: "website"}};
}
/** FR-006 conference detail: approved fields only; TBA where not confirmed; register via the account (FR-023). */
export default async function ConferenceDetail({params}: {params: Promise<{slug: string}>}) {
  const d = await load((await params).slug);
  if (!d?.c) notFound();
  const {c, event} = d;
  const ld = {"@context": "https://schema.org", "@type": "Event", name: c.title, ...(c.startsAt ? {startDate: c.startsAt.toISOString()} : {}), eventStatus: "https://schema.org/EventScheduled",
    location: {"@type": "Place", name: event.venue, address: {"@type": "PostalAddress", addressLocality: "Jakarta", addressCountry: "ID"}}, superEvent: {"@type": "Event", name: event.title}};
  const desc = c.description.en;
  return <main className="portal-shell">
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(ld).replace(/</g, "\\u003c")}} />
    <nav className="breadcrumb" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><a href="/conferences">Conferences</a></li><li aria-current="page">{c.title}</li></ol></nav>
    <header><p className="eyebrow">CONFERENCE</p><h1>{c.title}</h1></header>
    <section className="record"><dl className="cms-stats">
      <div><dt>Date &amp; time</dt><dd style={{fontSize: "1rem"}}>{c.startsAt ? wib(c.startsAt) : "To be announced"}</dd></div>
      <div><dt>Venue</dt><dd style={{fontSize: "1rem"}}>{event.venue}</dd></div>
      <div><dt>Fee</dt><dd style={{fontSize: "1rem"}}>{c.admissionMode === "FREE" ? "Free" : c.admissionMode === "TBA" ? "To be announced" : idr(c.feeMinor!) + " (manual invoice)"}</dd></div>
      <div><dt>Seats</dt><dd style={{fontSize: "1rem"}}>{c.registrationState === "AVAILABLE" ? (c.remainingSeats ?? "") + " available" : c.registrationState === "FULL" ? "Fully booked — waitlist available" : "Registration opens after approval"}</dd></div>
    </dl></section>
    <section>{desc?.summary && <p><strong>{desc.summary}</strong></p>}
      {desc?.body ? desc.body.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>) : <p>Programme details will be announced by the organizer.</p>}</section>
    <section className="cms-row-actions">
      {c.registrationState !== "NOT_READY" ? <a className="button-link" href={"/account?tab=conference&conference=" + c.id}>{c.registrationState === "FULL" ? "Join the waitlist" : "Register in your account"}</a>
        : <p className="micro">Registration is not open yet.</p>}
      <span className="micro">{c.admissionMode === "MANUAL_INVOICE" ? "Paid seats are confirmed after the organizer's Finance team verifies your bank transfer. No online card payment." : ""}</span>
    </section>
  </main>;
}
