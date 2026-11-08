import {NextRequest, NextResponse} from "next/server";
import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import sharp from "sharp";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
export const runtime = "nodejs";
/** FR-037: content asset upload — MIME/magic-checked images re-encoded to WebP (EXIF stripped), ≤8 MB,
 * alt text and rights status required, audited. Returns a public URL for content items. */
export async function POST(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN", "CONTENT_EDITOR"]);
    const fd = await req.formData(); const file = fd.get("file");
    const meta = z.object({altText: z.string().trim().min(3).max(300), rightsStatus: z.enum(["OWNED", "LICENSED", "ORGANIZER_PROVIDED", "PENDING_APPROVAL"])}).parse({altText: fd.get("altText"), rightsStatus: fd.get("rightsStatus")});
    if (!(file instanceof File) || file.size === 0 || file.size > 8 * 1024 * 1024) throw new HttpError(400, "BAD_FILE", "Upload an image up to 8 MB.");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new HttpError(415, "BAD_MIME", "PNG, JPG or WebP only.");
    let out: Buffer;
    try { out = await sharp(Buffer.from(await file.arrayBuffer()), {failOn: "error", limitInputPixels: 64e6}).rotate().resize({width: 2400, height: 2400, fit: "inside", withoutEnlargement: true}).webp({quality: 85}).toBuffer(); }
    catch { throw new HttpError(400, "INVALID_IMAGE", "Image could not be decoded."); }
    const key = randomUUID() + ".webp", dir = process.env.MEDIA_UPLOAD_DIR || path.join(process.env.FLOORPLAN_UPLOAD_DIR || path.resolve(".data/floorplans"), "../media");
    await mkdir(dir, {recursive: true}); await writeFile(path.join(dir, key), out, {flag: "wx", mode: 0o640});
    await db.auditLog.create({data: {adminId: actor.id, action: "ASSET_UPLOADED", resourceType: "MediaAsset", resourceId: key, afterState: {...meta, bytes: out.byteLength}}});
    return NextResponse.json({url: "/api/public/media/" + key, ...meta}, {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
