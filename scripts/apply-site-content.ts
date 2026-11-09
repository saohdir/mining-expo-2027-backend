/**
 * Applies prepared public-site content through the normal CMS page-layout model (CR-LANG-01, FR-012):
 *  - Simplified Chinese ("zh") layouts for every page and the shared header/footer: every designed text, image alt text and
 *    page SEO translated (scripts/i18n/zh.json, scripts/i18n/seo-zh.json); section order copied from the published English layout;
 *  - prepared legal drafts for /privacy/ and /terms/ in English and Chinese (scripts/i18n/legal.json).
 *
 *   docker compose --env-file .env.uat -f deploy/compose.uat.yml exec app npx tsx scripts/apply-site-content.ts --confirm            # drafts only
 *   docker compose --env-file .env.uat -f deploy/compose.uat.yml exec app npx tsx scripts/apply-site-content.ts --confirm --publish  # drafts + publish
 *
 *   … --confirm --publish --page=exhibitors   # only the listed page(s), e.g. after a page's design changed
 *
 * Every layout is validated with the same rules as the CMS. Publishing creates a normal revision (rollback in CMS → Pages & layout).
 * English pages other than privacy/terms are never touched. Re-running is safe (it replaces the seeded drafts/versions again).
 */
import fs from "node:fs";
import path from "node:path";
import {Prisma, PrismaClient} from "@prisma/client";
import {defaultLayout, layoutProblems, layoutSchema, PAGE_FIELDS, PAGE_KEYS, pruneLayout, type Layout} from "../src/lib/page-layout";

const db = new PrismaClient();
const dir = path.join(__dirname, "i18n");
const zh: Record<string, string> = JSON.parse(fs.readFileSync(path.join(dir, "zh.json"), "utf8"));
const seoZh: Record<string, [string, string]> = JSON.parse(fs.readFileSync(path.join(dir, "seo-zh.json"), "utf8"));
type LegalLoc = {seo: {title: string; description: string}; fields: Record<string, string>; blocks: [string, string][]};
const legal: Record<string, Record<"en" | "zh", LegalLoc>> = JSON.parse(fs.readFileSync(path.join(dir, "legal.json"), "utf8"));
const SYSTEM = "system:apply-site-content";

async function baseBlocks(page: string) {
  const en = await db.pageLayout.findUnique({where: {pageKey_locale: {pageKey: page, locale: "en"}}});
  const pub = en?.published ? layoutSchema.safeParse(pruneLayout(page, en.published)) : null;
  // Sections added to the static site after the English layout was published are appended in design order.
  const blocks = pub?.success ? pub.data.blocks : defaultLayout(page).blocks;
  const listed = new Set(blocks.flatMap(b => b.type === "static" ? [b.ref] : []));
  const added = defaultLayout(page).blocks.filter(b => b.type === "static" && !listed.has(b.ref));
  return [...blocks, ...added].filter(b => b.type === "static" || page !== "privacy" && page !== "terms");
}

function translatedFields(page: string) {
  const out: Layout["fields"] = {};
  for (const f of Object.values(PAGE_FIELDS[page] || {}).flat()) {
    if (f.kind === "image") { const t = f.alt && zh[f.alt]; if (t) out[f.key] = {alt: t}; }
    else { const t = f.text && zh[f.text]; if (t) out[f.key] = {mode: f.mode as "plain" | "rich" | "own", text: t}; }
  }
  return out;
}

function legalLayout(page: string, loc: "en" | "zh", blocks: Layout["blocks"]): Layout {
  const L = legal[page][loc], defs = new Map(Object.values(PAGE_FIELDS[page]).flat().map(f => [f.key, f]));
  const fields: Layout["fields"] = loc === "zh" ? translatedFields(page) : {};
  for (const [k, text] of Object.entries(L.fields)) fields[k] = {mode: defs.get(k)!.mode as "plain" | "rich" | "own", text};
  return {seo: L.seo, fields, blocks: [...blocks, ...L.blocks.map(([heading, body], i) => ({id: `legal-${i + 1}`, type: "text" as const, hidden: false, data: {eyebrow: "", heading, body}}))]};
}

async function save(page: string, locale: string, layout: Layout, publish: boolean) {
  const parsed = layoutSchema.parse(layout);
  const problems = layoutProblems(page, parsed);
  if (problems.length) throw new Error(`${page}/${locale}: ${problems.join("; ")}`);
  const json = parsed as unknown as Prisma.InputJsonValue;
  await db.$transaction(async tx => {
    const row = await tx.pageLayout.upsert({where: {pageKey_locale: {pageKey: page, locale}}, update: {draft: json, draftUpdatedAt: new Date(), draftUpdatedBy: SYSTEM},
      create: {pageKey: page, locale, draft: json, draftUpdatedBy: SYSTEM}});
    if (publish) {
      const version = row.version + 1;
      await tx.pageRevision.create({data: {pageKey: page, locale, version, layout: json, reason: "Prepared content (CR-LANG-01 / FR-012)", publishedBy: SYSTEM}});
      await tx.pageLayout.update({where: {id: row.id}, data: {published: json, version, publishedAt: new Date(), publishedBy: SYSTEM}});
    }
    await tx.auditLog.create({data: {action: publish ? "PAGE_PUBLISHED" : "PAGE_DRAFT_SAVED", resourceType: "PageLayout", resourceId: page + ":" + locale,
      afterState: {source: SYSTEM, fields: Object.keys(parsed.fields || {}).length, blocks: parsed.blocks.length}}});
  });
  return Object.keys(parsed.fields || {}).length;
}

async function main() {
  if (!process.argv.includes("--confirm")) throw new Error("Add --confirm (writes page layouts in DATABASE_URL). Add --publish to publish them too.");
  const publish = process.argv.includes("--publish");
  let total = 0;
  const only = process.argv.find(a => a.startsWith("--page="))?.slice(7).split(",");
  if (only?.some(p => !PAGE_KEYS.includes(p))) throw new Error("Unknown page in --page=. Pages: " + PAGE_KEYS.join(", "));
  for (const page of only || PAGE_KEYS) {
    const blocks = page === "site" ? [] : await baseBlocks(page);
    if (page === "privacy" || page === "terms") {
      total += await save(page, "en", legalLayout(page, "en", blocks), publish);
      total += await save(page, "zh", legalLayout(page, "zh", blocks), publish);
    } else {
      const [title, description] = seoZh[page] || ["", ""];
      total += await save(page, "zh", {seo: {title, description}, fields: translatedFields(page), blocks}, publish);
    }
    console.log(`  ${publish ? "published" : "draft saved"}: ${page}`);
  }
  console.log(`Done: ${total} field overrides across ${(only || PAGE_KEYS).length} pages (${publish ? "published" : "drafts only — publish in CMS or re-run with --publish"}).`);
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
