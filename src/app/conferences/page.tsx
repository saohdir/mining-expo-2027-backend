import type {Metadata} from "next";
import {publicConferences, wib, idr} from "@/lib/public-conferences";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {title: "Conferences & programmes | IMDX 2027", description: "Published conference programmes of the Indonesia Mining & Downstream Industries Exhibition 2027 at JIEXPO Jakarta.", alternates: {canonical: "/conferences"}};

/** FR-006 conference listing (published programmes only). */
export default async function Conferences() {
  const data = await publicConferences();
  return <main className="portal-shell"><header><p className="eyebrow">IMDX 2027 PROGRAMME</p><h1>Conferences <em>&amp; programmes.</em></h1>
    <p>Only programmes approved by the organizer are listed. Dates, fees and capacity appear once confirmed.</p></header>
    {!data?.conferences.length ? <section><p>The conference programme will be published soon.</p></section> :
      <section><ul className="cms-list">{data.conferences.map(c => <li key={c.id} className="record"><div>
        <h2><a href={"/conferences/" + c.slug}>{c.title}</a></h2>
        <p className="micro">{c.startsAt ? wib(c.startsAt) : "Schedule to be announced"} · {c.admissionMode === "FREE" ? "Free" : c.admissionMode === "TBA" ? "Fee to be announced" : idr(c.feeMinor!)}</p>
      </div></li>)}</ul></section>}
  </main>;
}
