"use client";
import {useEffect, useState} from "react";
import {APP_PAGE_FIELDS} from "@/lib/app-pages";

type FieldVal = {text?: string; src?: string; alt?: string};
const safe = (u?: string) => typeof u === "string" && (/^\/[A-Za-z0-9/_\-.#?=&%]*$/.test(u) || /^https:\/\//.test(u)) ? u : "";

/** Page banner of an app page (same look as the static pages' .page-hero). Photo, title and subtitle come from
 * CMS › Pages & layout (published layout, or the staff draft with ?cmsPreview=1); the defaults are shown until then. */
export function PageHero({pageKey, crumb}: {pageKey: string; crumb: string}) {
  const defs = APP_PAGE_FIELDS[pageKey]["page-hero"], def = (k: string) => defs.find(f => f.key === k)!;
  const [v, setV] = useState<Record<string, FieldVal>>({});
  useEffect(() => {
    const preview = new URLSearchParams(location.search).get("cmsPreview") === "1";
    fetch(preview ? `/api/admin/pages/${pageKey}?locale=en` : `/api/public/pages/${pageKey}?locale=en`, {cache: "no-store", credentials: "same-origin"})
      .then(r => r.ok ? r.json() : null).then(j => { const f = (preview ? j?.draft : j?.layout)?.fields; if (f && typeof f === "object") setV(f); }).catch(() => {});
  }, [pageKey]);
  const img = v["page-hero.0"] || {}, title = v["page-hero.1"]?.text || def("page-hero.1").text, sub = v["page-hero.2"]?.text || def("page-hero.2").text;
  return <header className="page-hero app-page-hero" data-cms-block="page-hero">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="page-hero-bg" src={safe(img.src) || def("page-hero.0").src} alt={img.alt ?? def("page-hero.0").alt ?? ""} width={1600} height={420} fetchPriority="high" />
    <div className="page-hero-inner">
      <nav className="breadcrumb page-hero-crumb" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li aria-current="page">{crumb}</li></ol></nav>
      <h1>{title}</h1>{sub && <p className="page-hero-sub">{sub}</p>}
    </div>
  </header>;
}
