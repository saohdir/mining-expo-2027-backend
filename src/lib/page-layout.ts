import {z} from "zod";
import manifest from "./page-manifest.json";

/** CMS page content & layout model. A layout is an ordered list of blocks rendered on the public static pages:
 * - "static": an existing section of the designed page (by its data-cms-block id) — can be moved or hidden;
 * - content blocks (hero, text, cards, cta, image, stats, faq, list) — plain text only, never raw HTML,
 *   so editors cannot inject scripts; links must be site paths or https URLs. */
export const PAGE_MANIFEST = manifest as Record<string, {id: string; label: string}[]>;
export const PAGE_KEYS = Object.keys(PAGE_MANIFEST);
export const PAGE_PATHS: Record<string, string> = Object.fromEntries(PAGE_KEYS.map(k => [k, k === "home" ? "/" : "/" + k + "/"]));

const text = (max: number) => z.string().max(max).default("");
const link = z.string().max(500).refine(v => v === "" || /^\/[A-Za-z0-9/_\-.#?=&%]*$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v) || /^mailto:[^\s"'<>]+$/.test(v), "Use a site path (/...), https:// or mailto: link").default("");
const base = {id: z.string().regex(/^[a-z0-9-]{1,60}$/), hidden: z.boolean().default(false)};
export const blockSchema = z.discriminatedUnion("type", [
  z.object({...base, type: z.literal("static"), ref: z.string().max(60)}).strict(),
  z.object({...base, type: z.literal("hero"), data: z.object({eyebrow: text(80), title: text(160), subtitle: text(400), ctaLabel: text(60), ctaHref: link, imageUrl: link, imageAlt: text(200)}).strict()}).strict(),
  z.object({...base, type: z.literal("text"), data: z.object({eyebrow: text(80), heading: text(160), body: text(6000)}).strict()}).strict(),
  z.object({...base, type: z.literal("cards"), data: z.object({heading: text(160), items: z.array(z.object({title: text(120), text: text(600), href: link, imageUrl: link, imageAlt: text(200)}).strict()).max(12).default([])}).strict()}).strict(),
  z.object({...base, type: z.literal("cta"), data: z.object({heading: text(160), text: text(600), buttonLabel: text(60), buttonHref: link}).strict()}).strict(),
  z.object({...base, type: z.literal("image"), data: z.object({imageUrl: link, imageAlt: text(200), caption: text(300)}).strict()}).strict(),
  z.object({...base, type: z.literal("stats"), data: z.object({heading: text(160), items: z.array(z.object({value: text(40), label: text(80)}).strict()).max(8).default([])}).strict()}).strict(),
  z.object({...base, type: z.literal("faq"), data: z.object({heading: text(160), items: z.array(z.object({q: text(200), a: text(1500)}).strict()).max(30).default([])}).strict()}).strict(),
  z.object({...base, type: z.literal("list"), data: z.object({heading: text(160), kind: z.enum(["PARTNER", "DOWNLOAD", "NEWS", "GALLERY", "CONTACT"])}).strict()}).strict()
]);
export const layoutSchema = z.object({
  seo: z.object({title: text(70), description: text(170)}).strict().default({title: "", description: ""}),
  blocks: z.array(blockSchema).max(60)
}).strict();
export type Layout = z.infer<typeof layoutSchema>;

/** Validates cross-references: static refs must exist on that page, ids unique, images need alt text. */
export function layoutProblems(pageKey: string, layout: Layout) {
  const p: string[] = [], ids = new Set<string>(), known = new Set((PAGE_MANIFEST[pageKey] || []).map(b => b.id));
  for (const b of layout.blocks) {
    if (ids.has(b.id)) p.push("Duplicate block id " + b.id); ids.add(b.id);
    if (b.type === "static" && !known.has(b.ref)) p.push("Unknown section " + b.ref);
    if ((b.type === "image" || b.type === "hero") && b.data.imageUrl && !b.data.imageAlt) p.push("Image in " + b.id + " needs alt text");
    if (b.type === "cards" && b.data.items.some(i => i.imageUrl && !i.imageAlt)) p.push("Card image in " + b.id + " needs alt text");
  }
  return p;
}
/** Default layout = the designed page exactly as built (all static sections, original order). */
export const defaultLayout = (pageKey: string): Layout => ({seo: {title: "", description: ""}, blocks: (PAGE_MANIFEST[pageKey] || []).map(b => ({id: "s-" + b.id, type: "static" as const, ref: b.id, hidden: false}))});
