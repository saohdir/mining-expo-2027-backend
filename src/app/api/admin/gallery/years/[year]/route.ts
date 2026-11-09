import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";

const schema = z.object({label: z.string().trim().max(60).nullable().optional(), published: z.boolean().optional()}).strict();
const yearOf = async (p: Promise<{year: string}>) => z.coerce.number().int().min(2000).max(2100).parse((await p).year);
/** Rename or show/hide a year button. */
export async function PATCH(req: NextRequest, {params}: {params: Promise<{year: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "CONTENT_EDITOR"]);
    const year = await yearOf(params), x = schema.parse(await req.json());
    if (!await db.galleryYear.count({where: {year}})) throw new HttpError(404, "NOT_FOUND", "Year not found.");
    const y = await db.galleryYear.update({where: {year}, data: x});
    await db.auditLog.create({data: {adminId: actor.id, action: "GALLERY_YEAR_EDITED", resourceType: "GalleryYear", resourceId: String(year), afterState: x}});
    return NextResponse.json({year: y}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
/** Remove an empty year. */
export async function DELETE(_req: NextRequest, {params}: {params: Promise<{year: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "CONTENT_EDITOR"]);
    const year = await yearOf(params);
    if (await db.galleryItem.count({where: {year}})) throw new HttpError(409, "NOT_EMPTY", "Move or delete the photos and videos of this year first.");
    await db.galleryYear.delete({where: {year}}).catch(() => { throw new HttpError(404, "NOT_FOUND", "Year not found."); });
    await db.auditLog.create({data: {adminId: actor.id, action: "GALLERY_YEAR_DELETED", resourceType: "GalleryYear", resourceId: String(year)}});
    return NextResponse.json({ok: true}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
