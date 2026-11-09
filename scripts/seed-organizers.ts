/**
 * The five organizer logo cards of "Organizer & Partners" (/partners/ and home) as CMS items — Website Content → Organizers —
 * in English and 中文, so they can be edited, reordered, replaced or unpublished without code.
 *
 *   docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx scripts/seed-organizers.ts --confirm
 *
 * Safe to re-run: an existing slug (per language) is left exactly as the CMS has it.
 */
import {PrismaClient} from "@prisma/client";

const db = new PrismaClient();
const ORGANIZERS: {slug: string; logo: string; en: string; zh: string}[] = [
  {slug: "shixin-international-exhibition-group", logo: "shixin-international-exhibition-group.webp", en: "Shixin International Exhibition Group", zh: "世信国际会展集团"},
  {slug: "pt-seesion-exhibition-indonesia", logo: "pt-seesion-exhibition-indonesia.webp", en: "PT Seesion Exhibition Indonesia", zh: "PT Seesion Exhibition Indonesia"},
  {slug: "aspindo", logo: "aspindo-indonesian-mining-services-association.webp", en: "Indonesian Mining Services Association", zh: "印度尼西亚矿业服务协会（ASPINDO）"},
  {slug: "ccpit", logo: "indonesia-china-business-council.webp", en: "China Council for the Promotion of International Trade", zh: "中国国际贸易促进委员会"},
  {slug: "apbi-icma", logo: "apbi-icma-indonesian-coal-mining-association.webp", en: "Indonesian Coal Mining Association (APBI-ICMA)", zh: "印度尼西亚煤炭矿业协会（APBI-ICMA）"}];

async function main() {
  if (!process.argv.includes("--confirm")) throw new Error("Add --confirm (writes organizer items to DATABASE_URL).");
  const by = (await db.adminUser.findFirst({where: {role: "SUPER_ADMIN"}, select: {id: true}}))?.id || "system:seed-organizers";
  let created = 0, kept = 0;
  for (const [n, o] of ORGANIZERS.entries()) for (const locale of ["en", "zh"] as const) {
    if (await db.contentItem.findUnique({where: {kind_locale_slug: {kind: "ORGANIZER", locale, slug: o.slug}}})) { kept++; continue; }
    const title = o[locale];
    await db.contentItem.create({data: {kind: "ORGANIZER", locale, slug: o.slug, title, imageUrl: "/assets/logos/" + o.logo, altText: (locale === "zh" ? "标志：" : "Logo of ") + title,
      rightsStatus: "ORGANIZER_PROVIDED", sortOrder: (n + 1) * 10, status: "PUBLISHED", publishedAt: new Date(), updatedBy: by}});
    created++;
  }
  console.log(`organizers: ${created} created, ${kept} already existed (left unchanged)`);
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
