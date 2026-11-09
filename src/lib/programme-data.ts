import type {Prisma} from "@prisma/client";
import {db} from "./db";
import {compareProgrammes, publicFacts} from "./programme";
import {ACTIVE_CONFERENCE_STATUSES, conferenceAvailability} from "./conference-capacity";

const withAll = {translations: true, conference: {select: {id: true, slug: true, title: true, published: true, capacity: true, feeMinor: true, event: {select: {published: true}}}}} satisfies Prisma.ProgrammeItemInclude;
export type FullItem = Prisma.ProgrammeItemGetPayload<{include: typeof withAll}>;
type Tr = FullItem["translations"][number];
const highlights = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Content for a locale; English when no translation exists (flagged so the page can mark it, never silently mixed). */
export function pick(i: FullItem, locale: string): {t: Tr; lang: string; fallback: boolean} | null {
  const t = i.translations.find(x => x.locale === locale), en = i.translations.find(x => x.locale === "en");
  if (t) return {t, lang: locale, fallback: false};
  return en ? {t: en, lang: "en", fallback: locale !== "en"} : null;
}

export function card(i: FullItem, locale: string) {
  const p = pick(i, locale); if (!p) return null;
  return {slug: i.slug, lang: p.lang, fallback: p.fallback, title: p.t.title, category: i.category, categoryLabel: p.t.categoryLabel, summary: p.t.summary,
    imageUrl: i.imageUrl, imageAlt: p.t.imageAlt || "", programmeStatus: i.programmeStatus, isLegacy: i.isLegacy, facts: publicFacts(i)};
}

/** Booking link only for a published conference of a published event; capacity/price come from the Conference, not from the page. */
async function conferenceCta(i: FullItem) {
  const c = i.conference;
  if (!c || !c.published || !c.event.published) return null;
  const used = await db.enrollment.count({where: {conferenceId: c.id, type: "CONFERENCE", status: {in: ACTIVE_CONFERENCE_STATUSES}}});
  const a = conferenceAvailability(c.capacity, used, c.feeMinor);
  return {href: "/conferences/" + encodeURIComponent(c.slug), state: a.registrationState};
}

export async function detail(i: FullItem, locale: string) {
  const p = pick(i, locale); if (!p) return null;
  return {...card(i, locale)!, overview: p.t.overview, highlights: highlights(p.t.highlights), seoTitle: p.t.seoTitle, seoDescription: p.t.seoDescription,
    locales: i.translations.map(t => t.locale), updatedAt: i.updatedAt.toISOString(), conference: await conferenceCta(i),
    source: i.isLegacy && i.sourceUrl ? {system: i.sourceSystem, id: i.sourceId, url: i.sourceUrl, title: i.sourceTitle} : null};
}

export async function publishedItems() {
  const items = await db.programmeItem.findMany({where: {status: "PUBLISHED", deletedAt: null}, include: withAll, take: 300});
  return items.sort(compareProgrammes);
}
export async function itemBySlug(slug: string, includeDrafts = false) {
  return db.programmeItem.findFirst({where: {slug, deletedAt: null, ...(includeDrafts ? {} : {status: "PUBLISHED"})}, include: withAll});
}
export async function itemById(id: string) { return db.programmeItem.findUnique({where: {id}, include: withAll}); }

/** Snapshot stored with every publish; used for rollback. */
export function snapshot(i: FullItem) {
  const {translations, conference: _c, revisions: _r, ...rest} = i as FullItem & {revisions?: unknown};
  return JSON.parse(JSON.stringify({...rest, translations: translations.map(({id: _id, itemId: _it, updatedAt: _u, ...t}) => t)}));
}
