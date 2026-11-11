import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {contentInput, publishProblems} from "@/lib/content";
const schema = contentInput.partial().extend({status: z.enum(["DRAFT", "PUBLISHED"]).optional(), reason: z.string().trim().min(4).max(300)}).strict();
/** Edit / publish / unpublish content (archive was replaced by delete). Publishing media requires alt text + approved rights (FR-037, NFR-12). */
export async function PATCH(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "CONTENT_EDITOR"]);
    const {id} = await params; z.string().uuid().parse(id);
    const {reason, ...x} = schema.parse(await req.json());
    const out = await db.$transaction(async tx => {
      const before = await tx.contentItem.findUnique({where: {id}});
      if (!before) throw new HttpError(404, "NOT_FOUND", "Content not found.");
      const next = {...before, ...x};
      if (x.status === "PUBLISHED") { const p = publishProblems(next); if (p.length) throw new HttpError(409, "NOT_PUBLISHABLE", p.join("; ")); }
      const c = await tx.contentItem.update({where: {id}, data: {...x, updatedBy: actor.id, ...(x.status === "PUBLISHED" && before.status !== "PUBLISHED" ? {publishedAt: new Date()} : {})}});
      await tx.auditLog.create({data: {adminId: actor.id, action: x.status && x.status !== before.status ? "CONTENT_" + x.status : "CONTENT_EDITED", resourceType: "ContentItem", resourceId: id,
        beforeState: {status: before.status, title: before.title}, afterState: {status: c.status, title: c.title, reason}}});
      return c;
    });
    return NextResponse.json({item: out}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}

/** Permanently delete a content item (replaces "archive"). Removed from the website at once; the audit log keeps a snapshot.
 * Uploaded files stay in the media store (an English and a 中文 version can share the same image). */
export async function DELETE(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "CONTENT_EDITOR"]);
    const {id} = await params; z.string().uuid().parse(id);
    const {reason} = z.object({reason: z.string().trim().max(300).optional()}).parse(await req.json().catch(() => ({})));
    await db.$transaction(async tx => {
      const before = await tx.contentItem.findUnique({where: {id}});
      if (!before) throw new HttpError(404, "NOT_FOUND", "Content not found (it may already be deleted).");
      await tx.contentItem.delete({where: {id}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "CONTENT_DELETED", resourceType: "ContentItem", resourceId: id,
        beforeState: {kind: before.kind, locale: before.locale, slug: before.slug, title: before.title, status: before.status, url: before.url, imageUrl: before.imageUrl}, afterState: {reason: reason || null}}});
    });
    return NextResponse.json({deleted: true}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
