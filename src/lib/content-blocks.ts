import {z} from "zod";

/** Block-based article body (Gutenberg-style). Stored in ContentItem.body as JSON:
 *   {"format":"blocks","v":1,"blocks":[...]}
 * Older articles keep the plain-text format (blank line = paragraph, "## " = subheading, "- " = bullet); both render on the
 * public site (assets/news.js). Inline marks inside text: **bold**, *italic*, [link text](https://… or /path). */
const safeUrl = z.string().max(500).refine(v => /^\/[A-Za-z0-9/_\-.%?=&#]+$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v), "Use a site path or https URL");
const text = z.string().max(8000);
export const blockSchema = z.discriminatedUnion("t", [
  z.object({t: z.literal("p"), text}).strict(),
  z.object({t: z.literal("h"), level: z.union([z.literal(2), z.literal(3)]), text: z.string().max(300)}).strict(),
  z.object({t: z.literal("list"), ordered: z.boolean(), items: z.array(z.string().max(2000)).max(100)}).strict(),
  z.object({t: z.literal("quote"), text, cite: z.string().max(200).optional()}).strict(),
  z.object({t: z.literal("image"), url: safeUrl, alt: z.string().max(300), caption: z.string().max(500).optional()}).strict(),
  z.object({t: z.literal("button"), text: z.string().max(120), url: safeUrl}).strict(),
  z.object({t: z.literal("divider")}).strict()
]);
export type Block = z.infer<typeof blockSchema>;
export const blocksDoc = z.object({format: z.literal("blocks"), v: z.literal(1), blocks: z.array(blockSchema).max(300)}).strict();

export const isBlocksBody = (body: string | null | undefined) => !!body && body.trimStart().startsWith('{"format":"blocks"');
export function parseBlocks(body: string | null | undefined): Block[] | null {
  if (!isBlocksBody(body)) return null;
  try { const r = blocksDoc.safeParse(JSON.parse(body!)); return r.success ? r.data.blocks : null; } catch { return null; }
}
export const serializeBlocks = (blocks: Block[]) => JSON.stringify({format: "blocks", v: 1, blocks});

/** Convert the old plain-text body into blocks (used when an older article is opened in the editor). */
export function legacyToBlocks(body: string | null | undefined): Block[] {
  const out: Block[] = []; let para: string[] = [], list: string[] = [];
  const flush = () => { if (para.length) out.push({t: "p", text: para.join("\n")}); if (list.length) out.push({t: "list", ordered: false, items: list}); para = []; list = []; };
  for (const raw of String(body || "").replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith("## ")) { flush(); out.push({t: "h", level: 2, text: line.slice(3)}); continue; }
    if (/^[-•]\s+/.test(line)) { if (para.length) { out.push({t: "p", text: para.join("\n")}); para = []; } list.push(line.replace(/^[-•]\s+/, "")); continue; }
    if (list.length) { out.push({t: "list", ordered: false, items: list}); list = []; }
    para.push(line);
  }
  flush();
  return out;
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]!));
const okHref = (u: string) => /^https:\/\/[^\s"'<>]+$/.test(u) || /^\/[A-Za-z0-9/_\-.%?=&#]*$/.test(u);
/** Inline marks → HTML. Text is escaped first, so only these marks produce tags. */
export function inline(s: string) {
  return esc(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => okHref(href.replace(/&amp;/g, "&")) ? `<a href="${href}"${href.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${label}</a>` : m)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\n/g, "<br>");
}
/** Same HTML the public article page produces (CMS preview). */
export function renderBlocksHtml(blocks: Block[]) {
  return blocks.map(b => {
    switch (b.t) {
      case "p": return b.text.trim() ? `<p>${inline(b.text)}</p>` : "";
      case "h": return `<h${b.level}>${esc(b.text)}</h${b.level}>`;
      case "list": { const tag = b.ordered ? "ol" : "ul"; const items = b.items.filter(i => i.trim()); return items.length ? `<${tag}>${items.map(i => `<li>${inline(i)}</li>`).join("")}</${tag}>` : ""; }
      case "quote": return b.text.trim() ? `<blockquote><p>${inline(b.text)}</p>${b.cite ? `<cite>${esc(b.cite)}</cite>` : ""}</blockquote>` : "";
      case "image": return okHref(b.url) ? `<figure><img src="${esc(b.url)}" alt="${esc(b.alt)}" loading="lazy">${b.caption ? `<figcaption>${inline(b.caption)}</figcaption>` : ""}</figure>` : "";
      case "button": return okHref(b.url) && b.text.trim() ? `<p class="news-article-cta"><a class="btn btn-orange" href="${esc(b.url)}"${b.url.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${esc(b.text)} <span aria-hidden="true">↗</span></a></p>` : "";
      case "divider": return "<hr>";
    }
  }).join("");
}
