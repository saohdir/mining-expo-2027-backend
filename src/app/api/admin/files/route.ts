import {NextRequest, NextResponse} from "next/server";
import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
export const runtime = "nodejs";
const LIMIT = 25 * 1024 * 1024;
const mediaDir = () => process.env.MEDIA_UPLOAD_DIR || path.join(process.env.FLOORPLAN_UPLOAD_DIR || path.resolve(".data/floorplans"), "../media");

/** PDF upload for Website content → Downloads (brochures, exhibitor manuals). Content-sniffed (%PDF- header), ≤25 MB,
 * stored beside the content images and served by /api/public/media/<uuid>.pdf. Returns url, fileType and size. */
export async function POST(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN", "CONTENT_EDITOR"]);
    const fd = await req.formData(); const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "BAD_FILE", "Choose a PDF file.");
    if (file.size > LIMIT) throw new HttpError(413, "TOO_LARGE", `The PDF is ${(file.size / 1048576).toFixed(1)} MB; the limit is 25 MB. Compress it (e.g. “Reduce file size” when exporting) and try again.`);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new HttpError(415, "NOT_PDF", "This file is not a PDF. Export or save it as PDF first.");
    const key = randomUUID() + ".pdf", dir = mediaDir();
    await mkdir(dir, {recursive: true}); await writeFile(path.join(dir, key), bytes, {flag: "wx", mode: 0o640});
    const name = String(file.name || "document.pdf").replace(/[^\w .()-]+/g, "").slice(0, 120) || "document.pdf";
    await db.auditLog.create({data: {adminId: actor.id, action: "FILE_UPLOADED", resourceType: "MediaAsset", resourceId: key, afterState: {name, bytes: bytes.byteLength}}});
    return NextResponse.json({url: "/api/public/media/" + key, fileType: "PDF", fileSizeBytes: bytes.byteLength, name}, {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
