/**
 * Turns the three designed "Exhibition insights & updates" cards of the home page into CMS news articles (EN + 中文),
 * so they are editable in CMS → Website Content → News & updates and each card opens its own article page.
 *
 *   docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx scripts/seed-news-articles.ts --confirm
 *
 * Safe to re-run: an article whose slug already exists (any status) is left exactly as it is, so CMS edits are never overwritten.
 */
import {PrismaClient} from "@prisma/client";

const db = new PrismaClient();
const IMG = {
  lead: "https://images.unsplash.com/photo-1751054619908-65d27a503ce8?auto=format&fit=crop&w=1800&q=82",
  plant: "https://images.unsplash.com/photo-1768564206500-5cddb1fea679?auto=format&fit=crop&w=1500&q=80",
  pit: "https://images.unsplash.com/photo-1587919968590-fbc98cea6c9a?auto=format&fit=crop&w=2000&q=82"
};
type A = {slug: string; sortOrder: number; imageUrl: string; en: {role: string; title: string; summary: string; altText: string; body: string}; zh: {role: string; title: string; summary: string; altText: string; body: string}};
const ARTICLES: A[] = [
  {slug: "mining-metallurgy-downstream-meet-in-jakarta", sortOrder: 0, imageUrl: IMG.lead,
    en: {role: "EVENT PREVIEW · 2027", title: "Mining, metallurgy and downstream industries meet in Jakarta",
      summary: "Discover the equipment, technologies and industrial solutions represented across the exhibition's eight major focus areas.",
      altText: "Excavator and haul truck working at an open-pit mine at sunset",
      body: `From 26 to 28 May 2027, JIEXPO Kemayoran in Jakarta brings the whole mining value chain under one roof — from extraction at the source to the downstream applications that create new value.

## Eight focus areas
- Mining extraction equipment & technology
- Mineral processing & beneficiation
- Metallurgy & deep processing
- Downstream materials & applications
- Digital intelligence & automation
- Safety, environment & green mining
- Supporting equipment & consumables
- Exploration, engineering & investment

## Who you will meet
Mine owners, contractors, processors, manufacturers, technology providers, investors and industry associations from Indonesia, China and the wider region.

## Take part
Exhibitors can request booth space on the online floorplan; visitors register once for a personal QR pass. Conference seats are booked in the same account.`},
    zh: {role: "展会预览 · 2027", title: "矿业、冶金与下游产业齐聚雅加达",
      summary: "探索展会八大重点领域中的装备、技术与工业解决方案。",
      altText: "日落时分在露天矿作业的挖掘机与运输卡车",
      body: `2027年5月26日至28日，雅加达克玛约兰国际展览中心（JIEXPO）将汇聚完整的矿业价值链——从源头开采到创造新价值的下游应用。

## 八大重点领域
- 采矿设备与技术
- 矿物加工与选矿
- 冶金与深加工
- 下游材料与应用
- 数字智能与自动化
- 安全、环保与绿色矿山
- 配套设备与耗材
- 勘探、工程与投资

## 您将见到
来自印度尼西亚、中国及周边地区的矿山业主、承包商、加工企业、制造商、技术提供商、投资方与行业协会。

## 参与方式
参展商可在在线展位图上申请展位；观众只需注册一次即可获得个人二维码通行证。会议席位也可在同一账户中预订。`}},
  {slug: "from-raw-resources-to-higher-value-manufacturing", sortOrder: 1, imageUrl: IMG.plant,
    en: {role: "INDUSTRY FOCUS", title: "From raw resources to higher-value manufacturing",
      summary: "Mineral processing, metallurgy, and downstream end-use applications.",
      altText: "Industrial processing plant with towers and pipework",
      body: `Indonesia's downstream policy is turning ore into higher-value products at home — and the exhibition follows that journey step by step.

## Along the value chain
- Processing and beneficiation: crushing, grinding, screening, flotation and filtration
- Metallurgy: smelting, refining, casting, rolling and heat treatment
- Materials: nickel, copper, tin, aluminium, battery materials, stainless steel and alloys
- Applications: industrial components and downstream partnerships

## Why it matters
Each step adds value, jobs and new partnership opportunities — for technology suppliers, investors and the companies that build and run the plants.`},
    zh: {role: "产业聚焦", title: "从原材料到高附加值制造",
      summary: "矿物加工、冶金与下游终端应用。",
      altText: "设有塔架与管道的工业加工厂",
      body: `印度尼西亚的下游化政策正推动矿石在本土转化为高附加值产品——本届展会将完整呈现这一历程。

## 沿着价值链
- 加工与选矿：破碎、磨矿、筛分、浮选与过滤
- 冶金：冶炼、精炼、铸造、轧制与热处理
- 材料：镍、铜、锡、铝、电池材料、不锈钢与合金
- 应用：工业部件与下游合作

## 意义所在
每一个环节都在创造价值、就业与新的合作机会——惠及技术供应商、投资方以及建设和运营工厂的企业。`}},
  {slug: "showcase-solutions-across-the-mining-value-chain", sortOrder: 2, imageUrl: IMG.pit,
    en: {role: "EXHIBITOR OPPORTUNITIES", title: "Showcase solutions across the mining value chain",
      summary: "Equipment, digital automation, services and environmental technologies.",
      altText: "Yellow excavator on a mine bench against an evening sky",
      body: `IMDX 2027 gives exhibitors direct access to the people who specify, buy and finance mining and processing projects.

## What you can show
- Heavy equipment, drilling and haulage solutions
- Digital, monitoring and automation systems
- Engineering, testing and field services
- Safety and environmental technologies

## How booking works
Choose your preferred booths on the online floorplan, indoor or outdoor. The organizer reviews the request and sends a quotation; payment is by bank transfer to the account on your invoice.`},
    zh: {role: "参展机会", title: "展示覆盖矿业价值链的解决方案",
      summary: "装备、数字自动化、服务与环保技术。",
      altText: "傍晚天空下矿山台阶上的黄色挖掘机",
      body: `IMDX 2027 让参展商直接对接矿业与加工项目的选型、采购和投资决策者。

## 可展示内容
- 重型装备、钻探与运输解决方案
- 数字化、监测与自动化系统
- 工程、检测与现场服务
- 安全与环保技术

## 预订流程
在在线展位图上选择意向展位（室内或室外）。主办方审核申请后发送报价；付款方式为向发票上的账户银行转账。`}}];

async function main() {
  if (!process.argv.includes("--confirm")) throw new Error("Add --confirm (writes news articles to DATABASE_URL).");
  const by = (await db.adminUser.findFirst({where: {role: "SUPER_ADMIN"}, select: {id: true}}))?.id || "system:seed-news-articles";
  let created = 0, kept = 0;
  for (const a of ARTICLES) for (const locale of ["en", "zh"] as const) {
    const t = a[locale];
    if (await db.contentItem.findUnique({where: {kind_locale_slug: {kind: "NEWS", locale, slug: a.slug}}})) { kept++; continue; }
    await db.contentItem.create({data: {kind: "NEWS", locale, slug: a.slug, title: t.title, summary: t.summary, body: t.body, role: t.role, imageUrl: a.imageUrl, altText: t.altText,
      rightsStatus: "LICENSED", sortOrder: a.sortOrder, status: "PUBLISHED", publishedAt: new Date(), updatedBy: by}});
    created++;
  }
  console.log(`news articles: ${created} created, ${kept} already existed (left unchanged)`);
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
