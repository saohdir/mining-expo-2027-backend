import {NextRequest, NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {publishProblems, WRITE_ROLES} from "@/lib/programme";
import {itemById, snapshot} from "@/lib/programme-data";

const schema = z.object({action: z.enum(["publish", "unpublish", "archive", "delete", "restore", "approve", "rollback"]), reason: z.string().trim().min(4).max(300), version: z.number().int().positive().optional()}).strict();
const AUDIT: Record<string, string> = {publish: "PROGRAMME_PUBLISHED", unpublish: "PROGRAMME_UNPUBLISHED", archive: "PROGRAMME_ARCHIVED", delete: "PROGRAMME_DELETED", restore: "PROGRAMME_RESTORED", approve: "PROGRAMME_APPROVED", rollback: "PROGRAMME_ROLLED_BACK"};

/** Publish / unpublish / archive / soft-delete / restore / editorial approval / rollback to a published version. Bookings are never touched. */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin([...WRITE_ROLES]);
    const {id} = await params; z.string().uuid().parse(id);
    const x = schema.parse(await req.json());
    if (x.action === "approve" && actor.role !== "SUPER_ADMIN") throw new HttpError(403, "OWNER_APPROVAL", "Editorial approval of imported/reference content is a Super Admin (Product Owner) decision.");
    const result = await db.$transaction(async tx => {
      const i = await itemById(id); if (!i) throw new HttpError(404, "NOT_FOUND", "Programme not found.");
      const done = (data: Prisma.ProgrammeItemUpdateInput) => tx.programmeItem.update({where: {id}, data: {...data, updatedBy: actor.id}});
      let version: number | null = null;
      switch (x.action) {
        case "publish": {
          const p = publishProblems(i, i.translations); if (p.length) throw new HttpError(409, "NOT_PUBLISHABLE", p.join("; "));
          await done({status: "PUBLISHED", publishedAt: new Date()});
          const last = await tx.programmeRevision.findFirst({where: {itemId: id}, orderBy: {version: "desc"}, select: {version: true}});
          version = (last?.version ?? 0) + 1;
          const fresh = await tx.programmeItem.findUniqueOrThrow({where: {id}, include: {translations: true, conference: {select: {id: true, slug: true, title: true, published: true, capacity: true, feeMinor: true, event: {select: {published: true}}}}}});
          await tx.programmeRevision.create({data: {itemId: id, version, snapshot: snapshot(fresh), reason: x.reason, createdBy: actor.id}});
          break; }
        case "unpublish": if (i.status !== "PUBLISHED") throw new HttpError(409, "NOT_LIVE", "Only a published page can be unpublished."); await done({status: "DRAFT"}); break;
        case "archive": await done({status: "ARCHIVED"}); break;
        case "delete": await done({status: "ARCHIVED", deletedAt: new Date()}); break;
        case "restore": if (!i.deletedAt) throw new HttpError(409, "NOT_DELETED", "Programme is not deleted."); await done({status: "DRAFT", deletedAt: null}); break;
        case "approve": await done({editorialStatus: "APPROVED"}); break;
        case "rollback": {
          const r = x.version && await tx.programmeRevision.findUnique({where: {itemId_version: {itemId: id, version: x.version}}});
          if (!r) throw new HttpError(404, "NO_VERSION", "Version not found.");
          const s = r.snapshot as Record<string, unknown> & {translations: {locale: string; title: string; categoryLabel: string | null; summary: string; overview: string; highlights: Prisma.InputJsonValue; imageAlt: string | null; seoTitle: string | null; seoDescription: string | null; reviewStatus: string}[]};
          const pickKeys = ["category", "programmeStatus", "isLegacy", "displayOrder", "imageUrl", "imageRightsStatus", "startTime", "endTime", "venue", "feeLabel", "currency", "dateConfirmed", "venueConfirmed", "feeConfirmed", "conferenceId", "editorialNote"] as const;
          const data = Object.fromEntries(pickKeys.map(k => [k, s[k] ?? null])) as Prisma.ProgrammeItemUncheckedUpdateInput;
          await tx.programmeItem.update({where: {id}, data: {...data, eventDate: s.eventDate ? new Date(String(s.eventDate)) : null, updatedBy: actor.id}});
          await tx.programmeTranslation.deleteMany({where: {itemId: id}});
          for (const t of s.translations) await tx.programmeTranslation.create({data: {itemId: id, ...t}});
          version = r.version; break; }
      }
      await tx.auditLog.create({data: {adminId: actor.id, action: AUDIT[x.action], resourceType: "ProgrammeItem", resourceId: id, beforeState: {status: i.status, editorialStatus: i.editorialStatus}, afterState: {reason: x.reason, version}}});
      return tx.programmeItem.findUniqueOrThrow({where: {id}, select: {id: true, slug: true, status: true, editorialStatus: true, deletedAt: true, publishedAt: true}});
    }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
    return NextResponse.json({item: result, previewUrl: "/programme/" + result.slug + "/"}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
