import {NextRequest, NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {compareProgrammes, itemInput, publishProblems, READ_ROLES, WRITE_ROLES} from "@/lib/programme";
import {assertConfirmRights, itemData, translationRows, uniqueError} from "./shared";

const H = {"Cache-Control": "private,no-store"};
/** CMS list: search + filters (status, regular/legacy, category, missing translation), deterministic public order, 25 per page. */
export async function GET(req: NextRequest) {
  try {
    await admin([...READ_ROLES]);
    const sp = req.nextUrl.searchParams, q = (sp.get("q") || "").trim().slice(0, 80), status = sp.get("status") || "", group = sp.get("group") || "", category = sp.get("category") || "", locale = sp.get("missing") || "";
    const all = await db.programmeItem.findMany({where: {
      ...(status === "DELETED" ? {deletedAt: {not: null}} : {deletedAt: null, ...(status ? {status} : {})}),
      ...(group ? {isLegacy: group === "legacy"} : {}), ...(category ? {category} : {}),
      ...(q ? {OR: [{slug: {contains: q, mode: "insensitive"}}, {translations: {some: {title: {contains: q, mode: "insensitive"}}}}]} : {}),
      ...(locale === "zh" ? {translations: {none: {locale: "zh"}}} : {})}, include: {translations: true, conference: {select: {title: true}}}, take: 500});
    all.sort(compareProgrammes);
    const page = Math.max(1, Number(sp.get("page")) || 1), size = 25;
    const rows = all.slice((page - 1) * size, page * size).map(i => ({id: i.id, slug: i.slug, category: i.category, status: i.status, deleted: !!i.deletedAt, isLegacy: i.isLegacy, displayOrder: i.displayOrder,
      programmeStatus: i.programmeStatus, editorialStatus: i.editorialStatus, sourceSystem: i.sourceSystem, sourceId: i.sourceId, imageUrl: i.imageUrl, conference: i.conference?.title ?? null,
      title: i.translations.find(t => t.locale === "en")?.title ?? i.slug, locales: i.translations.map(t => t.locale), updatedAt: i.updatedAt, publishedAt: i.publishedAt,
      problems: publishProblems(i, i.translations)}));
    const conferences = await db.conference.findMany({select: {id: true, title: true, slug: true, published: true}, orderBy: {title: "asc"}});
    return NextResponse.json({total: all.length, page, pages: Math.max(1, Math.ceil(all.length / size)), rows, conferences}, {headers: H});
  } catch (e) { return failure(e); }
}
/** Create a DRAFT (never published directly). */
export async function POST(req: NextRequest) {
  try {
    const actor = await admin([...WRITE_ROLES]);
    const x = itemInput.parse(await req.json());
    assertConfirmRights(actor.role, x);
    if (x.conferenceId && !await db.conference.count({where: {id: x.conferenceId}})) throw new HttpError(400, "BAD_CONFERENCE", "Conference not found.");
    const dupTitle = await db.programmeTranslation.findFirst({where: {locale: "en", title: {equals: x.translations.en.title, mode: "insensitive"}, item: {deletedAt: null}}, select: {item: {select: {slug: true}}}});
    const item = await db.$transaction(async tx => {
      const i = await tx.programmeItem.create({data: {...itemData(x), status: "DRAFT", updatedBy: actor.id, translations: {create: translationRows(x)}}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "PROGRAMME_CREATED", resourceType: "ProgrammeItem", resourceId: i.id, afterState: {slug: i.slug, isLegacy: i.isLegacy, sourceId: i.sourceId}}});
      return i;
    }).catch(uniqueError);
    return NextResponse.json({item, warning: dupTitle ? `Another programme already uses this title (/${dupTitle.item.slug}/).` : null}, {status: 201, headers: H});
  } catch (e) { return failure(e); }
}
