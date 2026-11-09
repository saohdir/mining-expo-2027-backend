import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {itemInput, publishProblems, READ_ROLES, WRITE_ROLES} from "@/lib/programme";
import {itemById} from "@/lib/programme-data";
import {assertConfirmRights, itemData, translationRows, uniqueError} from "../shared";

const H = {"Cache-Control": "private,no-store"};
export async function GET(_req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    await admin([...READ_ROLES]);
    const {id} = await params; z.string().uuid().parse(id);
    const item = await itemById(id); if (!item) throw new HttpError(404, "NOT_FOUND", "Programme not found.");
    const [revisions, audit] = await Promise.all([
      db.programmeRevision.findMany({where: {itemId: id}, orderBy: {version: "desc"}, take: 20, select: {version: true, reason: true, createdAt: true, createdBy: true}}),
      db.auditLog.findMany({where: {resourceType: "ProgrammeItem", resourceId: id}, orderBy: {createdAt: "desc"}, take: 30, select: {action: true, createdAt: true, afterState: true, adminId: true}})]);
    return NextResponse.json({item, revisions, audit, problems: publishProblems(item, item.translations)}, {headers: H});
  } catch (e) { return failure(e); }
}
/** Save all fields + translations. A published page stays published (changes are live); the publish snapshot is taken on publish. */
export async function PUT(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin([...WRITE_ROLES]);
    const {id} = await params; z.string().uuid().parse(id);
    const {reason: rawReason, ...body} = (await req.json()) ?? {};
    const reason = z.string().trim().min(4).max(300).parse(rawReason);
    const x = itemInput.parse(body);
    const before = await db.programmeItem.findUnique({where: {id}, include: {translations: true}});
    if (!before || before.deletedAt) throw new HttpError(404, "NOT_FOUND", "Programme not found.");
    assertConfirmRights(actor.role, x, before);
    if (x.conferenceId && !await db.conference.count({where: {id: x.conferenceId}})) throw new HttpError(400, "BAD_CONFERENCE", "Conference not found.");
    // Editing an imported source's text resets the editorial approval for that source only if the source identity changes.
    const sourceChanged = (x.sourceSystem || null) !== before.sourceSystem || (x.sourceId || null) !== before.sourceId;
    if (before.status === "PUBLISHED") { const p = publishProblems({...before, ...itemData(x)}, translationRows(x).map(t => ({...t, imageAlt: t.imageAlt ?? null, overview: t.overview}))); if (p.length) throw new HttpError(409, "NOT_PUBLISHABLE", "This page is live; fix first: " + p.join("; ")); }
    const item = await db.$transaction(async tx => {
      const i = await tx.programmeItem.update({where: {id}, data: {...itemData(x), ...(sourceChanged ? {editorialStatus: "PENDING_REVIEW"} : {}), updatedBy: actor.id}});
      const keep = translationRows(x).map(t => t.locale);
      await tx.programmeTranslation.deleteMany({where: {itemId: id, locale: {notIn: keep}}});
      for (const t of translationRows(x)) await tx.programmeTranslation.upsert({where: {itemId_locale: {itemId: id, locale: t.locale}}, create: {itemId: id, ...t}, update: t});
      await tx.auditLog.create({data: {adminId: actor.id, action: "PROGRAMME_UPDATED", resourceType: "ProgrammeItem", resourceId: id,
        beforeState: {slug: before.slug, status: before.status, displayOrder: before.displayOrder, isLegacy: before.isLegacy}, afterState: {slug: i.slug, displayOrder: i.displayOrder, isLegacy: i.isLegacy, reason}}});
      return i;
    }).catch(uniqueError);
    return NextResponse.json({item}, {headers: H});
  } catch (e) { return failure(e); }
}
