/**
 * UAT SAMPLE DATA — makes every customer flow testable before the organizer supplies real data. Everything is clearly
 * labelled "sample" and is meant to be replaced in the CMS (or removed with --remove).
 *
 *   docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx scripts/seed-uat-sample-data.ts --confirm
 *   docker compose --env-file .env.uat -f deploy/compose.uat.yml exec -T app npx tsx scripts/seed-uat-sample-data.ts --confirm --remove
 *
 * Creates/updates (never touches records an editor has already filled in):
 *  - event published + visitor registration open;
 *  - the 3 programmes published with sample fee/capacity/schedule (only where fee/capacity are still empty);
 *  - a published sample floorplan with 66 booth units: indoor halls A/B/C + outdoor area (only if none is published);
 *  - sample participants: 12 visitors (6 checked in), 8 conference delegates (paid/unpaid/free), 5 exhibitor requests
 *    (new, custom size, outdoor, offered, confirmed + paid) with invoices — accounts *@sample.imdx.invalid;
 *  - partners (6 placeholder logos), downloads (3 sample PDFs), news (3 posts) in English and Chinese;
 *  - sample sponsorship packages block on /partners/ (EN + 中文);
 *  - sample booth-fee estimator tariffs and group-discount tiers.
 * Bank details and provider switches are environment values (see docs/UAT_SAMPLE_DATA.md).
 */
import {Prisma, PrismaClient} from "@prisma/client";
import {ESTIMATOR_KEY, tariffSchema} from "../src/lib/fee-estimator";
import {CHARGES_KEY, chargesConfigSchema} from "../src/lib/invoice-charges";
import {defaultLayout, layoutProblems, layoutSchema, type Layout} from "../src/lib/page-layout";
import {hashToken, randomToken, sealToken} from "../src/lib/security";
import {shortCodeFor, shortCodeHash} from "../src/lib/pass-code";

const db = new PrismaClient();
const BY = "system:uat-sample-data";
const SAMPLE = {approvedBy: "SAMPLE DATA (UAT) — replace with organizer-approved values", approvedAt: "2026-11-09"};
const now = new Date();

async function audit(action: string, resourceId: string, afterState: object) {
  await db.auditLog.create({data: {action, resourceType: "SampleData", resourceId, afterState: {...afterState, source: BY} as Prisma.InputJsonValue}});
}

async function eventAndProgrammes() {
  const ev = await db.event.findUniqueOrThrow({where: {code: process.env.ACTIVE_EVENT_CODE || "IMDX-2027"}});
  await db.event.update({where: {id: ev.id}, data: {published: true, visitorOpen: true}});
  const plan: Record<string, {fee: bigint; capacity: number; startsAt: string}> = {
    "mining-downstream-green-mining": {fee: 2500000n, capacity: 200, startsAt: "2027-05-26T13:00:00+07:00"},
    "china-indonesia-coal-energy": {fee: 1500000n, capacity: 150, startsAt: "2027-05-27T09:30:00+07:00"},
    "mining-industry-networking": {fee: 0n, capacity: 300, startsAt: "2027-05-27T18:30:00+07:00"}};
  let n = 0;
  for (const c of await db.conference.findMany({where: {eventId: ev.id}})) {
    const p = plan[c.slug]; if (!p) continue;
    await db.conference.update({where: {id: c.id}, data: {published: true, feeMinor: c.feeMinor ?? p.fee, capacity: c.capacity ?? p.capacity, startsAt: c.startsAt ?? new Date(p.startsAt)}});
    n++;
  }
  console.log(`event published + visitor registration open; ${n} programmes published (sample fee/capacity where empty)`);
  return ev;
}

async function floorplan(eventId: string) {
  const existing = await db.floorplan.findFirst({where: {eventId, status: "PUBLISHED"}, include: {units: {where: {hall: "Outdoor"}, select: {id: true}}}});
  if (existing) {
    // An earlier sample plan had no outdoor area: add it (only to the sample plan, never to an organizer's plan).
    if (existing.title.startsWith("Hall layout (SAMPLE") && !existing.units.length) {
      const raw = await db.boothCategory.upsert({where: {eventId_name: {eventId, name: "Raw space"}}, update: {}, create: {eventId, name: "Raw space", colorHex: "#2F6FD6", pattern: "DOTS", sortOrder: 2}});
      await db.boothUnit.createMany({data: Array.from({length: 6}, (_, i) => ({floorplanId: existing.id, code: `OUT-${i + 1}`, category: "Raw space", categoryId: raw.id, hall: "Outdoor", zone: "Outdoor",
        x: 640 + (i % 3) * 104, y: 420 + Math.floor(i / 3) * 110, w: 100, h: 100, lengthM: 10, widthM: 10, areaSqm: 100, dimensionLabel: "10×10", status: "AVAILABLE" as const, placed: true}))});
      console.log("floorplan: added 6 outdoor units to the sample plan");
    } else console.log("floorplan: a published plan exists — left unchanged");
    return;
  }
  const cats = Object.fromEntries((await Promise.all([["Standard", "#6B3FA0", "SOLID", 0], ["Premium", "#D9468F", "HATCH", 1], ["Raw space", "#2F6FD6", "DOTS", 2], ["Corner", "#2F8F5B", "CROSS", 3]].map(([name, colorHex, pattern, sortOrder]) =>
    db.boothCategory.upsert({where: {eventId_name: {eventId, name: name as string}}, update: {}, create: {eventId, name: name as string, colorHex: colorHex as string, pattern: pattern as string, sortOrder: sortOrder as number}})))).map(c => [c.name, c]));
  const versionNo = ((await db.floorplan.aggregate({where: {eventId}, _max: {versionNo: true}}))._max.versionNo ?? 0) + 1;
  const units: Prisma.BoothUnitCreateWithoutFloorplanInput[] = [];
  const add = (code: string, cat: string, hall: string, x: number, y: number, l: number, w: number) => units.push({code, category: cat, boothCategory: {connect: {id: cats[cat].id}}, hall, zone: hall === "Outdoor" ? "Outdoor" : hall === "A" ? "Equipment" : "Processing",
    x, y, w: l * 10, h: w * 10, lengthM: l, widthM: w, areaSqm: l * w, dimensionLabel: `${l}×${w}`, status: "AVAILABLE", placed: true});
  // Hall A (left): 4 rows × 8 shell-scheme booths 3×3 m, corners marked; Hall B (right): premium 6×3 and raw space.
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
    const corner = c === 0 || c === 7;
    add(`A${r + 1}${String(c + 1).padStart(2, "0")}`, corner ? "Corner" : "Standard", "A", 40 + c * 34, 60 + r * 150 + (r % 2) * 32, 3, 3);
  }
  for (let i = 0; i < 12; i++) add(`B-P${String(i + 1).padStart(2, "0")}`, "Premium", "B", 360 + (i % 4) * 64, 60 + Math.floor(i / 4) * 40, 6, 3);
  for (let i = 0; i < 12; i++) add(`B-R${String(i + 1).padStart(2, "0")}`, i < 8 ? "Raw space" : "Premium", "B", 360 + (i % 4) * 64, 220 + Math.floor(i / 4) * 64, 6, 6);
  for (let i = 0; i < 4; i++) add(`C-X${i + 1}`, "Raw space", "C", 640 + (i % 2) * 124, 60 + Math.floor(i / 2) * 64, 12, 6);
  for (let i = 0; i < 6; i++) add(`OUT-${i + 1}`, "Raw space", "Outdoor", 640 + (i % 3) * 104, 420 + Math.floor(i / 3) * 110, 10, 10);
  const plan = await db.floorplan.create({data: {eventId, versionNo, title: "Hall layout (SAMPLE — replace with the organizer's floorplan)", canvasWidth: 1000, canvasHeight: 700,
    status: "PUBLISHED", publishedAt: now, units: {create: units}}});
  await audit("SAMPLE_FLOORPLAN_PUBLISHED", plan.id, {units: units.length});
  console.log(`floorplan: published sample v${versionNo} with ${units.length} units (indoor halls A, B, C + outdoor area)`);
}

type Item = {kind: string; slug: string; title: string; summary?: string; body?: string; url?: string; fileType?: string; fileSizeBytes?: number; imageUrl?: string; altText?: string; role?: string; sortOrder: number};
const EN: Item[] = [
  ...["Sample Organizer", "Sample Industry Association", "Sample Mining Partner", "Sample Technology Partner", "Sample Media Partner", "Sample Supporting Partner"].map((t, i) => ({
    kind: "PARTNER", slug: `sample-partner-${i + 1}`, title: t + " (sample)", summary: "Placeholder — replace with a confirmed partner and its approved logo.", imageUrl: `/assets/samples/partner-${i + 1}.svg`,
    altText: t + " logo (sample)", role: ["Organizer", "Supporting association", "Strategic partner", "Technology partner", "Media partner", "Supporting partner"][i], sortOrder: i})),
  {kind: "DOWNLOAD", slug: "sample-exhibitor-manual", title: "Exhibitor Manual (sample)", url: "/assets/samples/exhibitor-manual-sample.pdf", fileType: "PDF", fileSizeBytes: 2600, sortOrder: 0},
  {kind: "DOWNLOAD", slug: "sample-event-brochure", title: "Event Brochure (sample)", url: "/assets/samples/event-brochure-sample.pdf", fileType: "PDF", fileSizeBytes: 2500, sortOrder: 1},
  {kind: "DOWNLOAD", slug: "sample-sponsorship-packages", title: "Sponsorship Packages (sample)", url: "/assets/samples/sponsorship-packages-sample.pdf", fileType: "PDF", fileSizeBytes: 2500, sortOrder: 2},
  {kind: "NEWS", slug: "sample-news-floorplan-open", title: "Booth requests are open on the online floorplan (sample)", summary: "Choose preferred units on the published floorplan; the organizer confirms the final allocation and quotation.", body: "Sample news item for UAT testing. Replace it in CMS → Website Content.", sortOrder: 0},
  {kind: "NEWS", slug: "sample-news-conference-programme", title: "Conference programme announced (sample)", summary: "Two conferences and a networking reception are planned for 26–27 May 2027.", body: "Sample news item for UAT testing.", sortOrder: 1},
  {kind: "NEWS", slug: "sample-news-visitor-registration", title: "Visitor registration now available (sample)", summary: "Register once and receive a personal QR pass after confirmation.", body: "Sample news item for UAT testing.", sortOrder: 2}];
const ZH: Record<string, [string, string?]> = {
  "sample-partner-1": ["示例主办方（示例）", "占位内容——请替换为已确认的合作伙伴及其授权标志。"], "sample-partner-2": ["示例行业协会（示例）"], "sample-partner-3": ["示例矿业合作伙伴（示例）"],
  "sample-partner-4": ["示例技术合作伙伴（示例）"], "sample-partner-5": ["示例媒体合作伙伴（示例）"], "sample-partner-6": ["示例支持单位（示例）"],
  "sample-exhibitor-manual": ["参展商手册（示例）"], "sample-event-brochure": ["展会宣传册（示例）"], "sample-sponsorship-packages": ["赞助方案（示例）"],
  "sample-news-floorplan-open": ["在线展位图已开放展位申请（示例）", "在已发布的展位图上选择心仪展位；最终分配及报价由主办方确认。"],
  "sample-news-conference-programme": ["会议日程公布（示例）", "计划于2027年5月26–27日举办两场会议及一场商务交流酒会。"],
  "sample-news-visitor-registration": ["观众登记现已开放（示例）", "注册一次，确认后即可获得个人二维码证件。"]};

async function content(remove: boolean) {
  if (remove) { const r = await db.contentItem.deleteMany({where: {slug: {startsWith: "sample-"}, updatedBy: BY}}); console.log(`content: removed ${r.count} sample items`); return; }
  let n = 0;
  for (const it of EN) for (const locale of ["en", "zh"]) {
    const [title, summary] = locale === "zh" ? (ZH[it.slug] || [it.title]) : [it.title, it.summary];
    const data = {title, summary: summary ?? (locale === "zh" ? it.summary : null) ?? null, body: it.body ?? null, url: it.url ?? null, fileType: it.fileType ?? null, fileSizeBytes: it.fileSizeBytes ?? null,
      imageUrl: it.imageUrl ?? null, altText: it.altText ?? null, rightsStatus: it.imageUrl ? "ORGANIZER_PROVIDED" : null, role: it.role ?? null, sortOrder: it.sortOrder,
      status: "PUBLISHED", publishedAt: now, updatedBy: BY};
    await db.contentItem.upsert({where: {kind_locale_slug: {kind: it.kind, locale, slug: it.slug}}, update: data, create: {kind: it.kind, locale, slug: it.slug, ...data}});
    n++;
  }
  console.log(`content: ${n} sample items published (partners, downloads, news in EN + 中文)`);
}

const PACKAGES: Record<string, {heading: string; items: [string, string][]}> = {
  en: {heading: "Sponsorship packages (sample)", items: [["Platinum — sample", "Logo on all materials, keynote slot and a 72 m² premium booth. Price on request (sample)."],
    ["Gold — sample", "Logo on website and venue signage, panel slot and a 36 m² booth. Price on request (sample)."], ["Silver — sample", "Logo on the website and an 18 m² booth. Price on request (sample)."]]},
  zh: {heading: "赞助方案（示例）", items: [["白金赞助——示例", "所有宣传物料展示标志、主旨演讲席位及72平方米高级展位。价格请咨询（示例）。"],
    ["金牌赞助——示例", "官网及现场标识展示标志、小组讨论席位及36平方米展位。价格请咨询（示例）。"], ["银牌赞助——示例", "官网展示标志及18平方米展位。价格请咨询（示例）。"]]}};

async function packages(remove: boolean) {
  for (const locale of ["en", "zh"]) {
    const row = await db.pageLayout.findUnique({where: {pageKey_locale: {pageKey: "partners", locale}}});
    const cur = row?.published ? layoutSchema.parse(row.published) : defaultLayout("partners");
    const blocks = cur.blocks.filter(b => b.id !== "sample-packages");
    if (!remove) blocks.push({id: "sample-packages", type: "cards", hidden: false, data: {heading: PACKAGES[locale].heading, items: PACKAGES[locale].items.map(([title, text]) => ({title, text, href: "/contact/", imageUrl: "", imageAlt: ""}))}});
    const layout: Layout = layoutSchema.parse({...cur, blocks});
    const problems = layoutProblems("partners", layout); if (problems.length) throw new Error(problems.join("; "));
    const json = layout as unknown as Prisma.InputJsonValue;
    await db.$transaction(async tx => {
      const r = await tx.pageLayout.upsert({where: {pageKey_locale: {pageKey: "partners", locale}}, update: {draft: json, draftUpdatedAt: now, draftUpdatedBy: BY}, create: {pageKey: "partners", locale, draft: json, draftUpdatedBy: BY}});
      const version = r.version + 1;
      await tx.pageRevision.create({data: {pageKey: "partners", locale, version, layout: json, reason: remove ? "Remove sample sponsorship packages" : "Sample sponsorship packages (UAT)", publishedBy: BY}});
      await tx.pageLayout.update({where: {id: r.id}, data: {published: json, version, publishedAt: now, publishedBy: BY}});
    });
  }
  console.log(`partners page: sample sponsorship packages ${remove ? "removed" : "published"} (EN + 中文)`);
}

async function settings(remove: boolean) {
  if (remove) {
    await db.appSetting.deleteMany({where: {key: ESTIMATOR_KEY, updatedBy: BY}});
    console.log("estimator: sample tariffs removed (group discounts stay in Invoice Taxes & Fees — edit there)"); return;
  }
  const tariffs = tariffSchema.parse({currency: "IDR", categories: [{name: "Standard", perSqmMinor: "3500000", minimumSqm: 9}, {name: "Corner", perSqmMinor: "3850000", minimumSqm: 9},
    {name: "Premium", perSqmMinor: "4250000", minimumSqm: 18}, {name: "Raw space", perSqmMinor: "3000000", minimumSqm: 36}],
    packages: [{name: "Shell scheme 9 m² (sample)", maxSqm: 9, priceMinor: "31500000", includes: "Walls, fascia, carpet, 2 chairs, 1 table, lighting (sample)"},
      {name: "Shell scheme 18 m² (sample)", maxSqm: 18, priceMinor: "60000000", includes: "Walls, fascia, carpet, furniture set, lighting (sample)"}],
    taxNote: "SAMPLE TARIFFS — not real prices. Excludes VAT.", ...SAMPLE});
  await db.appSetting.upsert({where: {key: ESTIMATOR_KEY}, update: {value: JSON.stringify(tariffs), updatedBy: BY}, create: {key: ESTIMATOR_KEY, value: JSON.stringify(tariffs), updatedBy: BY}});
  const cur = await db.appSetting.findUnique({where: {key: CHARGES_KEY}});
  const base = cur ? chargesConfigSchema.parse(JSON.parse(cur.value)) : chargesConfigSchema.parse({charges: [], ...SAMPLE});
  const charges = chargesConfigSchema.parse({...base, groupDiscounts: base.groupDiscounts.length ? base.groupDiscounts : [{minDelegates: 5, rateBps: 500}, {minDelegates: 10, rateBps: 1000}]});
  await db.appSetting.upsert({where: {key: CHARGES_KEY}, update: {value: JSON.stringify(charges)}, create: {key: CHARGES_KEY, value: JSON.stringify(charges), updatedBy: BY}});
  await audit("SAMPLE_SETTINGS_APPLIED", "settings", {estimator: true, groupDiscounts: charges.groupDiscounts});
  console.log("estimator: sample tariffs saved; group discounts: 5% from 5 delegates, 10% from 10 (sample)");
}

/** Sample participants so CMS lists, finance and reports have data: visitors (some checked in), conference delegates
 * (paid, unpaid, free) and exhibitors (new, custom size, outdoor, offered, confirmed + paid). Accounts: *@sample.imdx.invalid. */
const DOMAIN = "@sample.imdx.invalid";
const PEOPLE: [string, string, string, string][] = [
  ["BAPAK", "Budi Santoso", "Mine Manager", "PT Contoh Tambang Nusantara"], ["IBU", "Siti Rahma", "Procurement Lead", "PT Contoh Nikel Sulawesi"],
  ["BAPAK", "Andi Wijaya", "Plant Engineer", "PT Contoh Smelter Indonesia"], ["IBU", "Dewi Lestari", "Sustainability Officer", "PT Contoh Energi Hijau"],
  ["BAPAK", "Rudi Hartono", "Operations Director", "PT Contoh Batubara Kalimantan"], ["IBU", "Maya Putri", "Business Development", "PT Contoh Alat Berat"],
  ["BAPAK", "Wang Lei", "Sales Manager", "Contoh Mining Equipment Co., Ltd."], ["IBU", "Li Na", "Project Engineer", "Contoh Metallurgy Group"],
  ["BAPAK", "Hendra Gunawan", "Geologist", "PT Contoh Eksplorasi"], ["IBU", "Ratna Sari", "HSE Manager", "PT Contoh Tambang Emas"],
  ["BAPAK", "Agus Prasetyo", "Maintenance Supervisor", "PT Contoh Jasa Tambang"], ["IBU", "Fitri Handayani", "Finance Manager", "PT Contoh Investasi Mineral"],
  ["BAPAK", "Zhang Wei", "Technical Director", "Contoh Automation Ltd."], ["IBU", "Nur Aini", "Analyst", "PT Contoh Riset Mineral"],
  ["BAPAK", "Yusuf Hakim", "Purchasing Manager", "PT Contoh Logistik Tambang"], ["IBU", "Lina Kurnia", "Marketing Manager", "PT Contoh Baterai Indonesia"],
  ["BAPAK", "Chen Hao", "General Manager", "Contoh Crushing Systems"], ["IBU", "Anisa Fitri", "Engineer", "PT Contoh Konsultan Tambang"],
  ["BAPAK", "Joko Susilo", "CEO", "PT Contoh Pertambangan Timur"], ["IBU", "Melati Ayu", "Event Coordinator", "PT Contoh Media Industri"]];

async function participants(eventId: string, remove: boolean) {
  const accounts = await db.customerAccount.findMany({where: {email: {endsWith: DOMAIN}}, select: {id: true}});
  if (remove || accounts.length) {
    if (!remove) { console.log(`participants: ${accounts.length} sample participants already exist — left unchanged`); return; }
    const ids = accounts.map(a => a.id);
    const passIds = (await db.eventPass.findMany({where: {accountId: {in: ids}}, select: {id: true}})).map(p => p.id);
    const reqs = await db.boothRequest.findMany({where: {accountId: {in: ids}}, select: {id: true, assignments: {select: {boothUnitId: true}}}});
    const invIds = (await db.invoice.findMany({where: {accountId: {in: ids}}, select: {id: true}})).map(i => i.id);
    await db.$transaction([
      db.admission.deleteMany({where: {passId: {in: passIds}}}), db.passScan.deleteMany({where: {passId: {in: passIds}}}), db.eventPass.deleteMany({where: {id: {in: passIds}}}),
      db.invoiceItem.deleteMany({where: {invoiceId: {in: invIds}}}), db.manualTransfer.deleteMany({where: {invoiceId: {in: invIds}}}), db.invoice.deleteMany({where: {id: {in: invIds}}}),
      db.boothUnit.updateMany({where: {id: {in: reqs.flatMap(r => r.assignments.map(a => a.boothUnitId))}}, data: {status: "AVAILABLE", approvedPublicName: null}}),
      db.boothAssignment.deleteMany({where: {boothRequestId: {in: reqs.map(r => r.id)}}}), db.boothOffer.deleteMany({where: {boothRequestId: {in: reqs.map(r => r.id)}}}),
      db.boothRequest.deleteMany({where: {id: {in: reqs.map(r => r.id)}}}), db.enrollment.deleteMany({where: {accountId: {in: ids}}}),
      db.customerSession.deleteMany({where: {accountId: {in: ids}}}), db.customerProfile.deleteMany({where: {accountId: {in: ids}}}), db.customerAccount.deleteMany({where: {id: {in: ids}}})]);
    console.log(`participants: removed ${ids.length} sample participants and their registrations`);
    return;
  }
  const admin = await db.adminUser.findFirstOrThrow({where: {role: "SUPER_ADMIN"}});
  const ev = await db.event.findUniqueOrThrow({where: {id: eventId}});
  const confs = await db.conference.findMany({where: {eventId, published: true}, orderBy: {startsAt: "asc"}});
  const plan = await db.floorplan.findFirst({where: {eventId, status: "PUBLISHED"}, include: {units: {where: {status: "AVAILABLE"}, orderBy: {code: "asc"}}}});
  let inv = 0;
  const mkAccount = async (i: number) => {
    const [salutation, fullName, jobTitle, organization] = PEOPLE[i];
    return db.customerAccount.create({data: {email: `sample${String(i + 1).padStart(2, "0")}${DOMAIN}`, status: "ACTIVE", verifiedEmailAt: now, phone: "+62812999" + String(10000 + i), verifiedPhoneAt: now,
      profile: {create: {salutation, fullName: fullName + " (sample)", jobTitle, organization, country: /Co\.|Ltd|Group|Systems/.test(organization) ? "China" : "Indonesia", consentVersion: "uat-sample", consentAt: now, futureContactOptIn: i % 4 !== 3, futureContactAt: i % 4 !== 3 ? now : null}}}, include: {profile: true}});
  };
  const snap = (a: Awaited<ReturnType<typeof mkAccount>>) => ({salutation: a.profile!.salutation, fullName: a.profile!.fullName, jobTitle: a.profile!.jobTitle, organization: a.profile!.organization, email: a.email, whatsapp: a.phone, sample: true});
  const pass = async (accountId: string, enrollmentId: string, entitlement: string) => { const t = randomToken();
    return db.eventPass.create({data: {accountId, enrollmentId, eventId, tokenHash: hashToken(t), shortCodeHash: shortCodeHash(shortCodeFor(t)), encryptedToken: sealToken(t), expiresAt: ev.endsAt, entitlement}}); };
  const invoice = async (accountId: string, link: {enrollmentId?: string; boothRequestId?: string}, desc: string, amount: bigint, paid: bigint) => {
    inv++;
    const status = paid === 0n ? "ISSUED" : paid >= amount ? "PAID" : "PARTIALLY_PAID";
    const i = await db.invoice.create({data: {number: `SAMPLE-2027-${String(inv).padStart(4, "0")}`, accountId, ...link, status, totalMinor: amount, minimumDpMinor: link.boothRequestId ? amount / 2n : 0n,
      issuedAt: now, dueAt: new Date(now.getTime() + 14 * 86400000), items: {create: [{description: desc + " (sample)", quantity: 1, unitPriceMinor: amount, amountMinor: amount}]}}});
    if (paid > 0n) await db.manualTransfer.create({data: {invoiceId: i.id, amountMinor: paid, bankReference: "SAMPLE-REF-" + inv, status: "VERIFIED", transferredAt: now, verifiedAt: now, verifiedBy: admin.id, payerName: "Sample payer"}});
  };
  // 12 visitors, 6 checked in on day 1.
  for (let i = 0; i < 12; i++) {
    const a = await mkAccount(i);
    const e = await db.enrollment.create({data: {accountId: a.id, eventId, type: "VISITOR", status: "CONFIRMED", confirmedAt: now, consentAt: now, profileSnapshot: snap(a)}});
    const p = await pass(a.id, e.id, "EXPO_ENTRY");
    if (i < 6) { const at = new Date(`2027-05-26T${String(9 + i).padStart(2, "0")}:15:00+07:00`);
      await db.admission.create({data: {passId: p.id, zone: "EXPO_ENTRY", dayKey: "2027-05-26", gate: "SAMPLE-GATE-A", admittedBy: admin.id, admittedAt: at}});
      await db.passScan.create({data: {passId: p.id, gate: "SAMPLE-GATE-A", zone: "EXPO_ENTRY", result: "VALID_ACCEPTED", scannedBy: admin.id, createdAt: at}}); }
  }
  // 8 conference delegates (accounts 13–20 reuse the visitor list's companies): paid, unpaid, free.
  for (let i = 0; i < 8 && confs.length; i++) {
    const a = await mkAccount(12 + i), conf = confs[i % confs.length], free = (conf.feeMinor ?? 0n) === 0n, paidNow = free || i < 4;
    const e = await db.enrollment.create({data: {accountId: a.id, eventId, conferenceId: conf.id, type: "CONFERENCE", status: paidNow ? "CONFIRMED" : "SUBMITTED", confirmedAt: paidNow ? now : null, consentAt: now, profileSnapshot: snap(a)}});
    if (!free) await invoice(a.id, {enrollmentId: e.id}, "Conference seat — " + conf.title, conf.feeMinor!, paidNow ? conf.feeMinor! : 0n);
    if (paidNow) { await pass(a.id, e.id, conf.zoneCode || "CONFERENCE"); await pass(a.id, e.id, "EXPO_ENTRY"); }
  }
  // 5 exhibitors on the published plan (reusing participant accounts 1–5 as PICs).
  if (plan) {
    const pics = await db.customerAccount.findMany({where: {email: {endsWith: DOMAIN}}, orderBy: {email: "asc"}, take: 5, include: {profile: true}});
    const units = plan.units, outdoor = units.filter(u => /outdoor/i.test(u.hall || "") || /outdoor/i.test(u.zone || "")), indoor = units.filter(u => !outdoor.includes(u));
    const specs = [
      {status: "NEW", loc: "INDOOR", units: indoor.slice(0, 1), products: "Haul trucks and mining excavators"},
      {status: "NEW", loc: "INDOOR", units: [], products: "Crushing and screening plant", customSize: "10 × 12 m (120 m²)"},
      {status: "NEW", loc: "OUTDOOR", units: outdoor.slice(0, 1), products: "Live drilling rig demonstration"},
      {status: "OFFERED", loc: "INDOOR", units: indoor.slice(2, 4), products: "Mine-site automation software and sensors"},
      {status: "CONFIRMED", loc: "INDOOR", units: indoor.slice(5, 6), products: "Battery materials and nickel processing"}];
    for (const [k, sp] of specs.entries()) {
      const a = pics[k]; if (!a) break;
      const area = sp.units.reduce((t, u) => t + Number(u.areaSqm), 0) || 120;
      await db.enrollment.create({data: {accountId: a.id, eventId, type: "EXHIBITOR", status: sp.status === "CONFIRMED" ? "CONFIRMED" : "SUBMITTED", confirmedAt: sp.status === "CONFIRMED" ? now : null, consentAt: now,
        profileSnapshot: {fullName: a.profile!.fullName, company: a.profile!.organization, organization: a.profile!.organization, picWhatsapp: a.phone, requestedAreaSqm: area, sample: true}}});
      const r = await db.boothRequest.create({data: {accountId: a.id, eventId, floorplanId: plan.id, preferredUnitIds: sp.units.map(u => u.id), requestedAreaSqm: area, status: sp.status as never,
        companySnapshot: {name: a.profile!.organization, contactName: a.profile!.fullName, picWhatsapp: a.phone, email: a.email, products: sp.products, location: sp.loc, customSize: sp.customSize ?? null, planVersion: plan.versionNo, sample: true}}});
      if (sp.status === "OFFERED" || sp.status === "CONFIRMED") {
        const price = BigInt(Math.round(area * 3500000));
        await db.boothOffer.create({data: {boothRequestId: r.id, revision: 1, floorplanVersionNo: plan.versionNo, offeredUnitIds: sp.units.map(u => u.id), offeredUnits: sp.units.map(u => ({id: u.id, code: u.code, areaSqm: Number(u.areaSqm)})),
          offeredAreaSqm: area, quotedPriceMinor: price, offeredBy: admin.id, acceptedAt: sp.status === "CONFIRMED" ? now : null, expiresAt: new Date(now.getTime() + 14 * 86400000), notes: "Sample quotation"}});
        if (sp.status === "CONFIRMED") {
          for (const u of sp.units) { await db.boothAssignment.create({data: {boothUnitId: u.id, boothRequestId: r.id, assignedBy: admin.id, approvedForPublic: true}});
            await db.boothUnit.update({where: {id: u.id}, data: {status: "OCCUPIED", approvedPublicName: a.profile!.organization}}); }
          await invoice(a.id, {boothRequestId: r.id}, "Booth " + sp.units.map(u => u.code).join(", "), price, price);
        }
      }
    }
  }
  await audit("SAMPLE_PARTICIPANTS_CREATED", "participants", {visitors: 12, delegates: Math.min(8, confs.length ? 8 : 0), exhibitors: plan ? 5 : 0});
  console.log(`participants: 12 visitors (6 checked in), ${confs.length ? 8 : 0} conference delegates, ${plan ? 5 : 0} exhibitor requests, ${inv} invoices`);
}

async function main() {
  if (!process.argv.includes("--confirm")) throw new Error("Add --confirm (writes sample data to DATABASE_URL). Add --remove to take the sample content out again.");
  if (process.env.APP_STAGE === "production") throw new Error("Refusing to load sample data in production.");
  const remove = process.argv.includes("--remove");
  const evId = (await db.event.findUniqueOrThrow({where: {code: process.env.ACTIVE_EVENT_CODE || "IMDX-2027"}})).id;
  if (!remove) { await eventAndProgrammes(); await floorplan(evId); }
  await participants(evId, remove);
  await content(remove); await packages(remove); await settings(remove);
  if (remove) console.log("Note: event/programme/floorplan values are kept (edit them in CMS); unpublish the sample floorplan there once the real one is ready.");
  console.log("Done.");
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());
