import {z} from "zod";

/** CR-PROGRAMME — editorial programme pages (/programme/<slug>/), EN + 中文.
 * Rules: published only in public; regular programmes before legacy/reference ones; date/venue/fee shown only when the organizer
 * confirmed them; a page never creates seats, prices or invoices (an optional link to a published Conference does the booking). */
export const PAGE_SIZE = 3;
export const LOCALES = ["en", "zh"] as const;
export const CATEGORIES = ["CONFERENCE", "MAIN_FORUM", "FORUM", "NETWORKING", "WORKSHOP", "REFERENCE"] as const;
export const PROGRAMME_STATUSES = ["TBA", "CONFIRMED", "REFERENCE"] as const;
export const STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export const RIGHTS = ["OWNED", "LICENSED", "ORGANIZER_PROVIDED", "PENDING_APPROVAL"] as const;
export const EDITORIAL = ["PENDING_REVIEW", "APPROVED"] as const;
export const WRITE_ROLES = ["SUPER_ADMIN", "CONTENT_EDITOR", "OPERATIONS"] as const;
/** Only the organizer side may confirm facts (date / venue / fee) or link a bookable conference. */
export const CONFIRM_ROLES = ["SUPER_ADMIN", "OPERATIONS"] as const;
export const READ_ROLES = ["SUPER_ADMIN", "CONTENT_EDITOR", "OPERATIONS", "SALES", "FINANCE", "VIEWER"] as const;

const safeUrl = z.string().trim().max(500).refine(v => /^\/[A-Za-z0-9/_\-.%]+$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v), "Use a site path (/assets/…) or an https URL");
const text = (max: number) => z.string().trim().max(max);
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens").min(2).max(80);

export const translationInput = z.object({
  title: text(160).min(3), categoryLabel: text(60).nullable().optional(), summary: text(400).min(10), overview: text(8000).default(""),
  highlights: z.array(text(240).min(2)).max(12).default([]), imageAlt: text(300).nullable().optional(),
  seoTitle: text(70).nullable().optional(), seoDescription: text(170).nullable().optional(), reviewStatus: z.enum(EDITORIAL).default("APPROVED")
}).strict();

export const itemInput = z.object({
  slug: slugSchema, category: z.enum(CATEGORIES).default("CONFERENCE"), programmeStatus: z.enum(PROGRAMME_STATUSES).default("TBA"),
  isLegacy: z.boolean().default(false), displayOrder: z.number().int().min(0).max(9999).default(0),
  imageUrl: safeUrl.nullable().optional(), imageRightsStatus: z.enum(RIGHTS).nullable().optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(), venue: text(160).nullable().optional(), feeLabel: text(120).nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
  dateConfirmed: z.boolean().default(false), venueConfirmed: z.boolean().default(false), feeConfirmed: z.boolean().default(false),
  conferenceId: z.string().uuid().nullable().optional(),
  sourceSystem: text(40).nullable().optional(), sourceId: text(40).nullable().optional(), sourceUrl: z.string().trim().url().max(500).refine(u => u.startsWith("https://"), "https only").nullable().optional(),
  sourceTitle: text(200).nullable().optional(), editorialStatus: z.enum(EDITORIAL).default("PENDING_REVIEW"), editorialNote: text(2000).nullable().optional(),
  translations: z.object({en: translationInput, zh: translationInput.nullable().optional()}).strict()
}).strict();
export type ItemInput = z.infer<typeof itemInput>;

type Sortable = {isLegacy: boolean; displayOrder: number; createdAt: Date | string; id: string};
/** Deterministic order: regular before legacy → displayOrder → createdAt → id. */
export function compareProgrammes(a: Sortable, b: Sortable) {
  return Number(a.isLegacy) - Number(b.isLegacy) || a.displayOrder - b.displayOrder ||
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
/** Page clamped to 1…pages (invalid, negative or too large values never give an empty page). */
export function paginate(total: number, requested: unknown, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(total / size));
  const n = Math.trunc(Number(requested));
  const page = Number.isFinite(n) ? Math.min(pages, Math.max(1, n)) : 1;
  return {page, pages, size, from: (page - 1) * size, to: Math.min(total, page * size), showControls: total > size};
}

type Facts = {eventDate: Date | null; startTime: string | null; endTime: string | null; venue: string | null; feeLabel: string | null; currency: string | null;
  dateConfirmed: boolean; venueConfirmed: boolean; feeConfirmed: boolean};
/** Only organizer-confirmed facts are public; everything else is "to be announced". */
export function publicFacts(i: Facts) {
  return {
    date: i.dateConfirmed && i.eventDate ? i.eventDate.toISOString().slice(0, 10) : null,
    time: i.dateConfirmed && i.startTime ? i.startTime + (i.endTime ? "–" + i.endTime : "") : null,
    venue: i.venueConfirmed && i.venue ? i.venue : null,
    fee: i.feeConfirmed && i.feeLabel ? i.feeLabel : null
  };
}

type Tr = {locale: string; title: string; summary: string; overview: string; imageAlt: string | null};
/** Reasons an item cannot be published (shown in the CMS; enforced by the API). */
export function publishProblems(i: {imageUrl: string | null; imageRightsStatus: string | null; sourceSystem: string | null; editorialStatus: string; deletedAt?: Date | null}, tr: Tr[]) {
  const p: string[] = [];
  const en = tr.find(t => t.locale === "en");
  if (i.deletedAt) p.push("Deleted items cannot be published");
  if (!en) p.push("English title and summary are required");
  else if (!en.overview.trim()) p.push("English overview is required");
  if (i.imageUrl && (!i.imageRightsStatus || i.imageRightsStatus === "PENDING_APPROVAL")) p.push("Cover image needs an approved rights status");
  if (i.imageUrl && tr.some(t => !t.imageAlt?.trim())) p.push("Cover image needs alt text in every language");
  if (i.sourceSystem && i.editorialStatus !== "APPROVED") p.push("Imported/reference content needs editorial approval before publishing");
  return p;
}
