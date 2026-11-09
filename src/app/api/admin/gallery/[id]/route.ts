import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {publishProblems, removeFiles, RIGHTS} from "@/lib/gallery";

const t = (n: number) => z.string().trim().max(n).nullable().optional();
const schema = z.object({titleEn: t(160), titleZh: t(160), captionEn: t(500), captionZh: t(500), altEn: t(300), altZh: t(300), rightsStatus: z.enum(RIGHTS).nullable().optional(),
  year: z.number().int().min(2000).max(2100).optional(), sortOrder: z.number().int().min(0).max(99999).optional(), status: z.enum(["DRAFT", "PUBLISHED"]).optional(), retry: z.literal(true).optional()}).strict();
/** Edit texts, move to another year, order, publish/unpublish, retry a failed video compression. */
export async function PATCH(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "CONTENT_EDITOR"]);
    const {id} = await params; z.string().uuid().parse(id);
    const {retry, ...x} = schema.parse(await req.json());
    const before = await db.galleryItem.findUnique({where: {id}});
    if (!before) throw new HttpError(404, "NOT_FOUND", "Item not found.");
    if (x.year && x.year !== before.year && !await db.galleryYear.count({where: {year: x.year}})) throw new HttpError(400, "NO_YEAR", "Unknown year.");
    if (retry && !(before.processing === "FAILED" && before.originalKey)) throw new HttpError(409, "NOT_FAILED", "Only a failed video with its original file can be retried.");
    const next = {...before, ...x};
    if (x.status === "PUBLISHED") { const p = publishProblems(next); if (p.length) throw new HttpError(409, "NOT_PUBLISHABLE", p.join("; ")); }
    const item = await db.galleryItem.update({where: {id}, data: {...x, ...(retry ? {processing: "PENDING", processingError: null} : {}),
      ...(x.status === "PUBLISHED" && before.status !== "PUBLISHED" ? {publishedAt: new Date()} : {}), updatedBy: actor.id}});
    await db.auditLog.create({data: {adminId: actor.id, action: x.status && x.status !== before.status ? "GALLERY_" + x.status : retry ? "GALLERY_RETRY" : "GALLERY_EDITED", resourceType: "GalleryItem", resourceId: id,
      beforeState: {status: before.status, year: before.year}, afterState: {status: item.status, year: item.year}}});
    return NextResponse.json({item: {...item, problems: publishProblems(item)}}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
/** Delete an item and its files (photos/videos are not referenced anywhere else). */
export async function DELETE(_req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "CONTENT_EDITOR"]);
    const {id} = await params; z.string().uuid().parse(id);
    const i = await db.galleryItem.findUnique({where: {id}});
    if (!i) throw new HttpError(404, "NOT_FOUND", "Item not found.");
    if (i.processing === "PROCESSING") throw new HttpError(409, "BUSY", "This video is being compressed right now; try again in a moment.");
    await db.galleryItem.delete({where: {id}});
    await removeFiles(i);
    await db.auditLog.create({data: {adminId: actor.id, action: "GALLERY_DELETED", resourceType: "GalleryItem", resourceId: id, beforeState: {year: i.year, kind: i.kind, title: i.titleEn}}});
    return NextResponse.json({ok: true}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
