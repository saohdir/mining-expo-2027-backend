import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";

const schema = z.object({year: z.number().int().min(2000).max(2100), label: z.string().trim().max(60).nullable().optional(), published: z.boolean().default(true)}).strict();
/** Add a year button (e.g. 2026) to the Event Highlights page. */
export async function POST(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN", "CONTENT_EDITOR"]);
    const x = schema.parse(await req.json());
    if (await db.galleryYear.count({where: {year: x.year}})) throw new HttpError(409, "EXISTS", "This year already exists.");
    const y = await db.galleryYear.create({data: {year: x.year, label: x.label || null, published: x.published}});
    await db.auditLog.create({data: {adminId: actor.id, action: "GALLERY_YEAR_ADDED", resourceType: "GalleryYear", resourceId: String(x.year)}});
    return NextResponse.json({year: y}, {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
