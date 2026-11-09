import {NextRequest, NextResponse} from "next/server";
import {createWriteStream} from "node:fs";
import {open, rename, rm} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {Readable, Transform} from "node:stream";
import {pipeline} from "node:stream/promises";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {ensureDirs, incomingDir, PHOTO_MAX_BYTES, PHOTO_TYPES, processPhoto, RIGHTS, VIDEO_MAX_BYTES, VIDEO_TYPES} from "@/lib/gallery";
export const runtime = "nodejs";
export const maxDuration = 300;

const q = z.object({year: z.coerce.number().int().min(2000).max(2100), name: z.string().trim().max(200).optional(), rightsStatus: z.enum(RIGHTS).optional(), alt: z.string().trim().max(300).optional()});
/** Magic bytes: JPEG / PNG / WebP / HEIC for photos; MP4/MOV (ftyp), WebM/MKV (EBML), AVI (RIFF…AVI) for videos. */
function sniff(b: Buffer) {
  if (b[0] === 0xff && b[1] === 0xd8) return "photo"; if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "photo";
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "photo";
  const ftyp = b.toString("latin1", 4, 8) === "ftyp" ? b.toString("latin1", 8, 12) : "";
  if (/^(heic|heix|mif1|msf1)$/.test(ftyp)) return "photo"; if (ftyp) return "video";
  if (b.readUInt32BE(0) === 0x1a45dfa3) return "video"; if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 11) === "AVI") return "video";
  return null;
}
/** Upload one photo or video (raw request body, streamed to disk). Photos are compressed now; videos are queued for the worker. */
export async function POST(req: NextRequest) {
  let tmp = "";
  try {
    const actor = await admin(["SUPER_ADMIN", "CONTENT_EDITOR"]);
    const x = q.parse(Object.fromEntries(req.nextUrl.searchParams));
    if (!await db.galleryYear.count({where: {year: x.year}})) throw new HttpError(400, "NO_YEAR", "Add the year first.");
    const type = (req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const isPhoto = PHOTO_TYPES.includes(type), isVideo = VIDEO_TYPES.includes(type);
    if (!isPhoto && !isVideo) throw new HttpError(415, "BAD_TYPE", "Photos: JPG, PNG, WebP or HEIC. Videos: MP4, MOV, WebM, MKV or AVI.");
    const limit = isPhoto ? PHOTO_MAX_BYTES : VIDEO_MAX_BYTES;
    const declared = Number(req.headers.get("content-length") || 0);
    if (declared > limit) throw new HttpError(413, "TOO_LARGE", isPhoto ? "Photos up to 30 MB." : "Videos up to 600 MB.");
    if (!req.body) throw new HttpError(400, "EMPTY", "No file received.");
    await ensureDirs();
    tmp = path.join(incomingDir(), randomUUID() + ".upload");
    let size = 0;
    const counter = new Transform({transform(chunk, _e, cb) { size += chunk.length; if (size > limit) cb(new HttpError(413, "TOO_LARGE", isPhoto ? "Photos up to 30 MB." : "Videos up to 600 MB.")); else cb(null, chunk); }});
    await pipeline(Readable.fromWeb(req.body as import("node:stream/web").ReadableStream), counter, createWriteStream(tmp, {flags: "wx", mode: 0o640}));
    if (!size) throw new HttpError(400, "EMPTY", "The file is empty.");
    const head = Buffer.alloc(16); const fh = await open(tmp, "r"); await fh.read(head, 0, 16, 0); await fh.close();
    const kind = sniff(head);
    if (kind !== (isPhoto ? "photo" : "video")) throw new HttpError(415, "BAD_FILE", "The file content does not match its type.");
    const base = {year: x.year, originalName: x.name || null, originalBytes: size, rightsStatus: x.rightsStatus || null, altEn: x.alt || null, updatedBy: actor.id,
      sortOrder: ((await db.galleryItem.aggregate({where: {year: x.year}, _max: {sortOrder: true}}))._max.sortOrder ?? 0) + 10};
    let item;
    if (isPhoto) {
      let r; try { r = await processPhoto(tmp); } catch { throw new HttpError(400, "INVALID_IMAGE", "The photo could not be read."); }
      await rm(tmp, {force: true}); tmp = "";
      item = await db.galleryItem.create({data: {...base, kind: "PHOTO", processing: "READY", ...r}});
    } else {
      const key = randomUUID() + path.extname(x.name || "").toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 6);
      await rename(tmp, path.join(incomingDir(), key)); tmp = "";
      item = await db.galleryItem.create({data: {...base, kind: "VIDEO", processing: "PENDING", originalKey: key}});
    }
    await db.auditLog.create({data: {adminId: actor.id, action: "GALLERY_UPLOADED", resourceType: "GalleryItem", resourceId: item.id, afterState: {kind: item.kind, year: item.year, originalBytes: size, bytes: item.bytes}}});
    return NextResponse.json({item}, {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { if (tmp) await rm(tmp, {force: true}).catch(() => {}); return failure(e); }
}
