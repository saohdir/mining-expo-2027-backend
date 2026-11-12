"use client";

import {useEffect, useState} from "react";
import type React from "react";

const navigation = [
  {label: "About", items: [
    {label: "Event Overview", href: "/about/"},
    {label: "About Organizer", href: "/about-organizer/"},
    {label: "Organizers & Partners", href: "/partners/"},
    {label: "The Venue", href: "/the-venue/"}
  ]},
  {label: "Exhibit", items: [
    {label: "Why Exhibit", href: "/exhibitors/"},
    {label: "Booth Requests", href: "/floorplan"}
  ]},
  {label: "Visit", items: [
    {label: "Visitor Information", href: "/visitors/"},
    {label: "The Venue", href: "/the-venue/"}
  ]},
  {label: "Conferences", items: [
    {label: "Conferences", href: "/programme/"},
    {label: "My Conferences", href: "/account"}
  ]},
  {label: "Media", items: [
    {label: "News & Updates", href: "/news/"},
    {label: "Event Highlight", href: "/highlights/"}
  ]}
] as const;

/**
 * The secure account/CMS and the static public site live on one HTTPS origin in UAT.
 * Match the public site's navigation architecture without injecting static demo scripts.
 */
export default function MarketingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Inside the website's sign-in popup (/account?embed=1) the page shows only the form.
  const [embed, setEmbed] = useState(false);
  useEffect(() => { setEmbed(new URLSearchParams(window.location.search).get("embed") === "1" && window.parent !== window); }, []);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(null);
        setMobileOpen(false);
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);

  const close = () => {
    setMobileOpen(false);
    setExpanded(null);
  };

  if (embed) return null;

  return <>
    <div className="imdx-ribbon" role="note">
      <span className="imdx-ribbon-dot" aria-hidden="true" />
      PRE-GO-LIVE UAT
      <span className="imdx-ribbon-rule" aria-hidden="true" />
      PAYMENTS REQUIRE ADMIN VERIFICATION
    </div>
    <header className="imdx-site-header">
      <nav className="imdx-site-nav" aria-label="Main exhibition navigation">
        <a className="imdx-site-brand" href="/" aria-label="IMDX exhibition home" onClick={close}>
          <img src="/assets/imd-logo-orange.webp" width="145" height="55"
            alt="IMDX — Indonesia Mining & Downstream Industries Exhibition 2027" />
        </a>
        <button type="button" className="imdx-menu-toggle" aria-label="Toggle exhibition menu"
          aria-controls="imdx-primary-links" aria-expanded={mobileOpen}
          onClick={() => {setMobileOpen(value => !value);setExpanded(null);}}>
          <span/><span/><span/>
        </button>
        <div className={"imdx-primary-links" + (mobileOpen ? " is-open" : "")} id="imdx-primary-links">
          <a className="imdx-main-link" href="/" onClick={close}>Home</a>
          {navigation.map(group => {
            const open = expanded === group.label;
            const id = "imdx-menu-" + group.label.toLowerCase();
            return <div className={"imdx-menu" + (open ? " is-expanded" : "")} key={group.label}>
              <button type="button" aria-expanded={open} aria-controls={id}
                onClick={() => setExpanded(open ? null : group.label)}>
                {group.label}<span className="imdx-caret" aria-hidden="true">⌄</span>
              </button>
              <div className="imdx-dropdown" id={id}>
                {group.items.map(item => <a key={item.href+item.label} href={item.href} onClick={close}>{item.label}</a>)}
              </div>
            </div>;
          })}
          <a className="imdx-main-link" href="/contact/" onClick={close}>Contact</a>
          <a className="imdx-account-link" href="/account" onClick={close}>REGISTER / MY PASS ↗</a>
        </div>
      </nav>
    </header>
  </>;
}
