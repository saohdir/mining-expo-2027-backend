/**
 * CR-PROGRAMME seed (idempotent): the three current programme cards (published, as already shown on /programme/) and three
 * ICEE reference programmes (source IDs 4, 3, 2 — legacy, sorted last) as DRAFTS awaiting editorial approval.
 *
 *   docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx scripts/seed-programmes.ts --confirm
 *   … --confirm --approve-legacy   # ONLY after the Product Owner approved the reference copy: approve + publish the three ICEE pages
 *
 * Never overwrites: an existing slug or (sourceSystem, sourceId) is left exactly as the CMS has it. Source-reported facts (dates,
 * venue, fee) are stored in sourceFacts only — they are not official IMDX facts and are not shown publicly.
 */
import {Prisma, PrismaClient} from "@prisma/client";

const db = new PrismaClient();
type T = {title: string; categoryLabel: string; summary: string; overview: string; highlights: string[]; imageAlt: string; seoDescription: string; reviewStatus?: string};
type S = {slug: string; category: string; programmeStatus: string; isLegacy: boolean; displayOrder: number; imageUrl: string; source?: {id: string; url: string; title: string; facts: Prisma.InputJsonValue; note: string}; en: T; zh: T};

const PENDING_TOPICS = "Detailed agenda awaits organizer confirmation.";
export const PROGRAMMES: S[] = [
  {slug: "mining-downstream-industry-green-mining", category: "CONFERENCE", programmeStatus: "TBA", isLegacy: false, displayOrder: 10, imageUrl: "/assets/conference-keynote.webp",
    en: {title: "Mining Downstream Industry & Green Mining Conference", categoryLabel: "CONFERENCE", summary: "Policy perspectives, sustainable solutions and supply-demand matchmaking.",
      overview: "A conference for the people shaping Indonesia's downstream and green-mining agenda. It brings together policy perspectives, sustainable operating solutions and business matchmaking between supply and demand across the mining value chain.\n\nDetailed sessions, speakers and timing will be announced by the organizer.",
      highlights: ["Policy perspectives on mining downstreaming and green mining", "Sustainable and lower-carbon solutions for mining operations", "Supply–demand matchmaking between mine owners, processors and suppliers"],
      imageAlt: "Keynote presentation on a conference stage", seoDescription: "Policy perspectives, sustainable solutions and supply-demand matchmaking at IMDX 2027 in Jakarta."},
    zh: {title: "矿业下游产业与绿色矿山大会", categoryLabel: "会议", summary: "政策解读、可持续解决方案与供需对接。",
      overview: "面向推动印度尼西亚矿业下游化与绿色矿山发展的业界人士。大会汇聚政策解读、可持续运营解决方案，以及覆盖矿业价值链的供需商务对接。\n\n详细议程、演讲嘉宾与时间将由主办方另行公布。",
      highlights: ["矿业下游化与绿色矿山的政策解读", "面向矿山运营的可持续与低碳解决方案", "矿山业主、加工企业与供应商之间的供需对接"],
      imageAlt: "会议舞台上的主旨演讲", seoDescription: "IMDX 2027（雅加达）：政策解读、可持续解决方案与供需对接。"}},
  {slug: "china-indonesia-coal-energy-conference", category: "MAIN_FORUM", programmeStatus: "TBA", isLegacy: false, displayOrder: 20, imageUrl: "/assets/china-indonesia-forum.webp",
    en: {title: "China–Indonesia Coal & Energy Conference", categoryLabel: "MAIN FORUM", summary: "Industry trends, policy dialogue and bilateral business exchange.",
      overview: "The main forum of IMDX 2027 for coal and energy cooperation between China and Indonesia. It focuses on industry trends, policy dialogue and bilateral business exchange between companies, associations and institutions from both countries.\n\nDetailed sessions, speakers and timing will be announced by the organizer.",
      highlights: ["Industry trends in coal and energy", "Policy dialogue between China and Indonesia", "Bilateral business exchange and partnership building"],
      imageAlt: "Audience attending a professional forum", seoDescription: "Industry trends, policy dialogue and bilateral business exchange — China–Indonesia Coal & Energy Conference at IMDX 2027."},
    zh: {title: "中国—印度尼西亚煤炭与能源大会", categoryLabel: "主论坛", summary: "行业趋势、政策对话与双边商务交流。",
      overview: "IMDX 2027 关于中印尼煤炭与能源合作的主论坛，聚焦行业趋势、政策对话，以及两国企业、协会与机构之间的双边商务交流。\n\n详细议程、演讲嘉宾与时间将由主办方另行公布。",
      highlights: ["煤炭与能源行业趋势", "中国与印度尼西亚之间的政策对话", "双边商务交流与合作伙伴关系建设"],
      imageAlt: "参加专业论坛的观众", seoDescription: "行业趋势、政策对话与双边商务交流——IMDX 2027 中国—印度尼西亚煤炭与能源大会。"}},
  {slug: "indonesia-mining-industry-networking-reception", category: "NETWORKING", programmeStatus: "TBA", isLegacy: false, displayOrder: 30, imageUrl: "/assets/networking-reception.webp",
    en: {title: "Indonesia Mining Industry Networking Reception", categoryLabel: "NETWORKING", summary: "Connect with mine owners, contractors, manufacturers and industry organizations.",
      overview: "An informal evening to meet the people behind Indonesia's mining industry. The reception connects mine owners, contractors, manufacturers and industry organizations in a relaxed setting designed for conversation and new partnerships.\n\nTiming and venue details will be announced by the organizer.",
      highlights: ["Meet mine owners, contractors and manufacturers", "Connect with industry associations and organizations", "Relaxed setting for follow-up conversations and partnerships"],
      imageAlt: "Business professionals discussing around a meeting table", seoDescription: "Meet mine owners, contractors, manufacturers and industry organizations at the IMDX 2027 networking reception."},
    zh: {title: "印度尼西亚矿业商务交流酒会", categoryLabel: "商务交流", summary: "与矿山业主、承包商、制造商及行业组织建立联系。",
      overview: "在轻松的晚间氛围中结识印度尼西亚矿业的关键人士。酒会连接矿山业主、承包商、制造商与行业组织，为深入交流和建立新的合作伙伴关系创造机会。\n\n具体时间与地点将由主办方另行公布。",
      highlights: ["结识矿山业主、承包商与制造商", "对接行业协会与相关组织", "在轻松的环境中延续交流、拓展合作"],
      imageAlt: "围坐会议桌讨论的商务人士", seoDescription: "在 IMDX 2027 商务交流酒会上结识矿山业主、承包商、制造商与行业组织。"}},
  // ICEE references — legacy/provenance (sorted last), drafts until the Product Owner approves.
  {slug: "indonesia-china-coal-energy-conference-reference", category: "CONFERENCE", programmeStatus: "REFERENCE", isLegacy: true, displayOrder: 10, imageUrl: "/assets/industry-04.webp",
    source: {id: "4", url: "https://www.iceeind.com/activity/info.html?id=4", title: "Indonesia - China Coal & Energy Conference",
      facts: {date: "2027-05-26", venue: "JIEXPO Convention Centre and Theatre", fee: "USD 800 per person (conference fee, materials, luncheon, coffee breaks, dinner; visa excluded)",
        topics: ["bilateral government/business exchange", "coal and energy policy and trade", "clean/low-carbon solutions incl. coal preparation and coal chemicals", "equipment, technology and new-energy integration", "project matchmaking", "shared cooperation experience"]},
      note: "Near-identical title to the regular 'China–Indonesia Coal & Energy Conference' (MAIN FORUM). Kept as a separate REFERENCE page (no booking, no price shown) until the organizer confirms whether it is the same conference — Product Owner decision required before publishing."},
    en: {title: "Indonesia–China Coal & Energy Conference (reference)", categoryLabel: "CONFERENCE",
      summary: "Explore the policy, technology and partnerships shaping China–Indonesia coal and energy cooperation, from lower-carbon solutions to cross-border projects.",
      overview: "This reference page summarises a conference concept on coal and energy cooperation between Indonesia and China. It is aimed at government agencies, industry associations, energy companies, trade and investment institutions, and technology, equipment, exploration and engineering firms.\n\nThe programme centres on bilateral coal and energy policy, coal trade, cleaner and lower-carbon solutions, technology and equipment, and the integration of coal with new energy — with project matchmaking along the value chain. " + PENDING_TOPICS,
      highlights: ["A high-level exchange between government and industry from both countries", "Coal trade, cleaner and lower-carbon solutions such as coal preparation and coal chemicals", "Technology, equipment and coal–new-energy integration", "Project matchmaking and shared cooperation experience"],
      imageAlt: "Industrial materials processing facility", seoDescription: "Reference: policy, technology and partnerships in China–Indonesia coal and energy cooperation."},
    zh: {title: "印度尼西亚—中国煤炭与能源大会（参考）", categoryLabel: "会议", reviewStatus: "PENDING_REVIEW",
      summary: "探讨塑造中印尼煤炭与能源合作的政策、技术与伙伴关系——从低碳解决方案到跨境项目。",
      overview: "本参考页面介绍一项关于印度尼西亚与中国煤炭及能源合作的会议构想，面向政府部门、行业协会、能源企业、贸易投资机构，以及技术、装备、勘探与工程企业。\n\n内容聚焦两国煤炭与能源政策、煤炭贸易、清洁低碳解决方案、技术与装备，以及煤炭与新能源的融合发展，并围绕价值链开展项目对接。详细议程有待主办方确认。",
      highlights: ["两国政府与产业界的高层次交流", "煤炭贸易，以及选煤、煤化工等清洁低碳解决方案", "技术装备与煤炭—新能源融合发展", "项目对接与合作经验分享"],
      imageAlt: "工业材料加工设施", seoDescription: "参考：中印尼煤炭与能源合作中的政策、技术与伙伴关系。"}},
  {slug: "indonesia-clean-coal-green-mining-conference", category: "CONFERENCE", programmeStatus: "REFERENCE", isLegacy: true, displayOrder: 20, imageUrl: "/assets/industry-06.webp",
    source: {id: "3", url: "https://www.iceeind.com/activity/info.html?id=3", title: "Indonesia Clean Coal and Green Mining Conference",
      facts: {date: "2027-05-27", venue: "JIExpo Jakarta", fee: "Free admission (source-reported)",
        topics: ["Indonesian policy and project perspectives", "investment experience of Chinese underground mining companies", "alternative energy integration", "matchmaking between mine owners, investors and equipment suppliers"]},
      note: "Source 'Highlights' are substantially identical to source ID 2 although the titles differ — treated as unverified topic fit; no unique agenda asserted. Programme-specific topics need organizer confirmation."},
    en: {title: "Indonesia Clean Coal and Green Mining Conference", categoryLabel: "CONFERENCE",
      summary: "A forum exploring cleaner coal operations, responsible mining and technology-led collaboration for a more sustainable industrial future.",
      overview: "This reference page covers a conference concept on cleaner coal and green mining in Indonesia — how operations can become cleaner and more responsible, and how technology and partnerships support that shift.\n\nThe broader subject area includes policy and project perspectives, investment experience and matchmaking between mine owners, investors and equipment suppliers. " + PENDING_TOPICS,
      highlights: ["Cleaner coal operations and responsible mining", "Technology-led collaboration for sustainable operations", "Connecting mine owners, investors and equipment suppliers (topics to be confirmed)"],
      imageAlt: "Green landscape around a reclaimed mining area", seoDescription: "Reference: cleaner coal operations, responsible mining and technology-led collaboration in Indonesia."},
    zh: {title: "印度尼西亚清洁煤炭与绿色矿山大会", categoryLabel: "会议", reviewStatus: "PENDING_REVIEW",
      summary: "探讨更清洁的煤炭生产、负责任的矿业开发，以及以技术驱动的合作，共创更可持续的产业未来。",
      overview: "本参考页面介绍一项关于印度尼西亚清洁煤炭与绿色矿山的会议构想：如何让生产更清洁、更负责任，以及技术与合作伙伴关系如何推动这一转变。\n\n更广泛的议题包括政策与项目视角、投资经验，以及矿山业主、投资方与装备供应商之间的对接。详细议程有待主办方确认。",
      highlights: ["更清洁的煤炭生产与负责任的矿业开发", "以技术驱动的可持续运营合作", "对接矿山业主、投资方与装备供应商（议题待确认）"],
      imageAlt: "复垦矿区周边的绿色景观", seoDescription: "参考：印度尼西亚更清洁的煤炭生产、负责任矿业与技术驱动的合作。"}},
  {slug: "indonesia-coal-underground-mining-downstream-processing", category: "CONFERENCE", programmeStatus: "REFERENCE", isLegacy: true, displayOrder: 30, imageUrl: "/assets/industry-01.webp",
    source: {id: "2", url: "https://www.iceeind.com/activity/info.html?id=2", title: "Indonesia Coal Conference on Underground Mining and Downstream Processing",
      facts: {date: "2027-05-27", venue: "JIExpo Jakarta", fee: "Free admission (source-reported)",
        topics: ["underground mining and downstream processing projects and policies", "operational energy cost challenges", "new energy integration", "matchmaking with mining companies and equipment providers"]},
      note: "Source 'Highlights' match source ID 3 verbatim — provenance preserved, uncertainty noted; no unique agenda or attendee numbers asserted."},
    en: {title: "Indonesia Coal Conference on Underground Mining and Downstream Processing", categoryLabel: "CONFERENCE",
      summary: "Discover opportunities in underground mining and coal downstream development, with discussion of policy, investment, energy solutions and industrial partnerships.",
      overview: "This reference page covers a conference concept on underground coal mining and downstream processing in Indonesia — the projects and policies behind them, the energy costs of running operations, and how new energy can be integrated.\n\nIt is intended to connect mining companies with equipment and technology providers. " + PENDING_TOPICS,
      highlights: ["Underground mining and downstream processing: projects and policy", "Operational energy costs and new-energy integration", "Partnerships between mining companies and equipment providers"],
      imageAlt: "Heavy mining equipment working at an extraction site", seoDescription: "Reference: underground coal mining and downstream processing in Indonesia — policy, investment, energy and partnerships."},
    zh: {title: "印度尼西亚煤炭井工开采与下游加工大会", categoryLabel: "会议", reviewStatus: "PENDING_REVIEW",
      summary: "探索井工开采与煤炭下游开发的机遇，围绕政策、投资、能源解决方案与产业合作展开交流。",
      overview: "本参考页面介绍一项关于印度尼西亚煤炭井工开采与下游加工的会议构想：相关项目与政策、生产运营中的能源成本，以及新能源的融合应用。\n\n其目的在于连接矿业企业与装备和技术供应商。详细议程有待主办方确认。",
      highlights: ["井工开采与下游加工：项目与政策", "运营能源成本与新能源融合", "矿业企业与装备供应商之间的合作"],
      imageAlt: "在开采现场作业的重型矿山设备", seoDescription: "参考：印度尼西亚煤炭井工开采与下游加工——政策、投资、能源与合作。"}}];

async function main() {
  if (!process.argv.includes("--confirm")) throw new Error("Add --confirm (writes programme pages to DATABASE_URL).");
  const approve = process.argv.includes("--approve-legacy");
  const by = (await db.adminUser.findFirst({where: {role: "SUPER_ADMIN"}, select: {id: true}}))?.id || "system:seed-programmes";
  let created = 0, kept = 0, approved = 0;
  for (const p of PROGRAMMES) {
    const exists = await db.programmeItem.findFirst({where: {OR: [{slug: p.slug}, ...(p.source ? [{sourceSystem: "ICEE", sourceId: p.source.id}] : [])]}});
    if (exists) {
      kept++;
      if (approve && p.isLegacy && exists.status !== "PUBLISHED" && !exists.deletedAt) {
        await db.programmeItem.update({where: {id: exists.id}, data: {editorialStatus: "APPROVED", status: "PUBLISHED", publishedAt: new Date(), updatedBy: by}});
        await db.programmeTranslation.updateMany({where: {itemId: exists.id}, data: {reviewStatus: "APPROVED"}});
        await db.auditLog.create({data: {action: "PROGRAMME_PUBLISHED", resourceType: "ProgrammeItem", resourceId: exists.id, afterState: {reason: "Approved by Product Owner (seed --approve-legacy)"}}});
        approved++;
      }
      continue;
    }
    const regular = !p.isLegacy;
    await db.programmeItem.create({data: {slug: p.slug, category: p.category, programmeStatus: p.programmeStatus, isLegacy: p.isLegacy, displayOrder: p.displayOrder,
      imageUrl: p.imageUrl, imageRightsStatus: "ORGANIZER_PROVIDED", status: regular ? "PUBLISHED" : "DRAFT", publishedAt: regular ? new Date() : null,
      editorialStatus: regular ? "APPROVED" : "PENDING_REVIEW", updatedBy: by,
      ...(p.source ? {sourceSystem: "ICEE", sourceId: p.source.id, sourceUrl: p.source.url, sourceTitle: p.source.title, sourceFacts: p.source.facts, editorialNote: p.source.note} : {}),
      translations: {create: (["en", "zh"] as const).map(locale => { const t = p[locale]; return {locale, title: t.title, categoryLabel: t.categoryLabel, summary: t.summary, overview: t.overview,
        highlights: t.highlights, imageAlt: t.imageAlt, seoDescription: t.seoDescription, reviewStatus: t.reviewStatus || "APPROVED"}; })}}});
    created++;
  }
  console.log(`programmes: ${created} created, ${kept} already existed (left unchanged)${approve ? `, ${approved} reference pages approved + published` : ""}`);
}
if (require.main === module) main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
