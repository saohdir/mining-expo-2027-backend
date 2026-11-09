import {spawn} from "node:child_process";
import {createReadStream} from "node:fs";
import {mkdir, rename, rm, stat} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import sharp from "sharp";
import type {PrismaClient} from "@prisma/client";

/** Event Highlights gallery. Photos: re-encoded on upload (WebP, longest side 2000 px, EXIF stripped) + 4:3 thumbnail.
 * Videos: stored as uploaded, then the worker compresses them (H.264/AAC MP4, longest side 1280 px, CRF 28, fast-start)
 * and extracts a poster; the original is deleted afterwards. Files live in MEDIA_UPLOAD_DIR/gallery (a Docker volume on UAT). */
export const PAGE_SIZE = 12;
export const PHOTO_MAX_BYTES = 30 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 600 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/x-msvideo"];
export const RIGHTS = ["OWNED", "LICENSED", "ORGANIZER_PROVIDED", "PENDING_APPROVAL"] as const;
export const KEY_RE = /^[0-9a-f-]{36}\.(webp|mp4)$/;

export const mediaRoot = () => process.env.MEDIA_UPLOAD_DIR || path.join(process.env.FLOORPLAN_UPLOAD_DIR || path.resolve(".data/floorplans"), "../media");
export const galleryDir = () => path.join(mediaRoot(), "gallery");
export const incomingDir = () => path.join(galleryDir(), "incoming");
export async function ensureDirs() { await mkdir(incomingDir(), {recursive: true}); }
export const filePath = (key: string) => path.join(galleryDir(), key);

/** Photo → main WebP (≤2000 px) + 600×450 thumbnail. Returns keys, size and dimensions. */
export async function processPhoto(src: string) {
  const img = sharp(src, {failOn: "error", limitInputPixels: 120e6}).rotate();
  const main = await img.clone().resize({width: 2000, height: 2000, fit: "inside", withoutEnlargement: true}).webp({quality: 80}).toBuffer({resolveWithObject: true});
  const thumb = await img.clone().resize({width: 600, height: 450, fit: "cover", position: "attention"}).webp({quality: 70}).toBuffer();
  const fileKey = randomUUID() + ".webp", thumbKey = randomUUID() + ".webp";
  await sharp(main.data).toFile(filePath(fileKey)); await sharp(thumb).toFile(filePath(thumbKey));
  return {fileKey, thumbKey, bytes: main.info.size, width: main.info.width, height: main.info.height};
}

const run = (cmd: string, args: string[], timeoutMs: number) => new Promise<string>((resolve, reject) => {
  const p = spawn(cmd, args, {stdio: ["ignore", "pipe", "pipe"]});
  let out = "", err = "";
  const t = setTimeout(() => { p.kill("SIGKILL"); reject(new Error(cmd + " timed out")); }, timeoutMs);
  p.stdout.on("data", d => { out += d; }); p.stderr.on("data", d => { err = (err + d).slice(-2000); });
  p.on("error", e => { clearTimeout(t); reject(new Error((e as NodeJS.ErrnoException).code === "ENOENT" ? cmd + " is not installed" : e.message)); });
  p.on("close", code => { clearTimeout(t); code === 0 ? resolve(out) : reject(new Error(`${cmd} failed (${code}): ${err.split("\n").filter(Boolean).slice(-2).join(" ")}`)); });
});

/** Video → compressed MP4 + poster thumbnail (worker only; may take minutes). */
export async function processVideo(src: string) {
  const fileKey = randomUUID() + ".mp4", thumbKey = randomUUID() + ".webp", tmp = filePath(fileKey) + ".part.mp4", poster = filePath(thumbKey) + ".jpg";
  const ff = process.env.FFMPEG_PATH || "ffmpeg", fp = process.env.FFPROBE_PATH || "ffprobe";
  try {
    await run(ff, ["-hide_banner", "-loglevel", "error", "-y", "-i", src,
      "-vf", "scale='if(gte(iw,ih),min(1280,iw),-2)':'if(gte(iw,ih),-2,min(1280,ih))'",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-ac", "2",
      "-movflags", "+faststart", "-max_muxing_queue_size", "1024", tmp], 45 * 60_000);
    await rename(tmp, filePath(fileKey));
    const probe = JSON.parse(await run(fp, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", filePath(fileKey)], 60_000));
    const duration = Number(probe.format?.duration) || 0;
    await run(ff, ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(Math.min(1, duration / 2)), "-i", filePath(fileKey), "-frames:v", "1", "-q:v", "3", poster], 120_000);
    await sharp(poster).resize({width: 600, height: 450, fit: "cover"}).webp({quality: 70}).toFile(filePath(thumbKey));
    return {fileKey, thumbKey, bytes: (await stat(filePath(fileKey))).size, width: probe.streams?.[0]?.width ?? null, height: probe.streams?.[0]?.height ?? null, durationSec: duration || null};
  } finally { await rm(tmp, {force: true}); await rm(poster, {force: true}); }
}

/** Worker step: compress queued videos, one at a time (oldest first). */
export async function processPendingVideos(db: PrismaClient, max = 2) {
  for (let n = 0; n < max; n++) {
    const next = await db.galleryItem.findFirst({where: {kind: "VIDEO", processing: "PENDING"}, orderBy: {createdAt: "asc"}});
    if (!next) return;
    const claimed = await db.galleryItem.updateMany({where: {id: next.id, processing: "PENDING"}, data: {processing: "PROCESSING"}});
    if (!claimed.count) continue;
    const src = next.originalKey ? path.join(incomingDir(), next.originalKey) : "";
    try {
      const r = await processVideo(src);
      await db.galleryItem.update({where: {id: next.id}, data: {...r, processing: "READY", processingError: null, originalKey: null}});
      await rm(src, {force: true});
    } catch (e) {
      await db.galleryItem.update({where: {id: next.id}, data: {processing: "FAILED", processingError: (e as Error).message.slice(0, 500)}});
    }
  }
}

export async function removeFiles(i: {fileKey: string | null; thumbKey: string | null; originalKey: string | null}) {
  for (const k of [i.fileKey, i.thumbKey]) if (k) await rm(filePath(k), {force: true});
  if (i.originalKey) await rm(path.join(incomingDir(), i.originalKey), {force: true});
}

/** Public shape (published + ready only), localized with English fallback. */
export function publicItem(i: {id: string; kind: string; year: number; fileKey: string | null; thumbKey: string | null; width: number | null; height: number | null; durationSec: number | null;
  titleEn: string | null; titleZh: string | null; captionEn: string | null; captionZh: string | null; altEn: string | null; altZh: string | null}, locale: string) {
  const zh = locale === "zh", m = "/api/public/gallery-media/";
  return {id: i.id, kind: i.kind, year: i.year, url: i.fileKey ? m + i.fileKey : null, thumbUrl: i.thumbKey ? m + i.thumbKey : null, width: i.width, height: i.height,
    duration: i.durationSec, title: (zh && i.titleZh) || i.titleEn || "", caption: (zh && i.captionZh) || i.captionEn || "", alt: (zh && i.altZh) || i.altEn || ""};
}
export function publishProblems(i: {processing: string; rightsStatus: string | null; altEn: string | null}) {
  const p: string[] = [];
  if (i.processing !== "READY") p.push(i.processing === "FAILED" ? "Compression failed — retry or delete" : "Still being compressed");
  if (!i.rightsStatus || i.rightsStatus === "PENDING_APPROVAL") p.push("Choose an approved rights status");
  if (!i.altEn?.trim()) p.push("Add an English description (alt text)");
  return p;
}
export {createReadStream};
