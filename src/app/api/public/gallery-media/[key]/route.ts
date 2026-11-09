import {NextRequest} from "next/server";
import {stat} from "node:fs/promises";
import {Readable} from "node:stream";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {createReadStream, filePath, KEY_RE} from "@/lib/gallery";
export const runtime = "nodejs";

/** Gallery files. Published items for everyone; drafts only for signed-in CMS staff. Byte ranges for video seeking. */
export async function GET(req: NextRequest, {params}: {params: Promise<{key: string}>}) {
  const nf = () => new Response("Not found", {status: 404, headers: {"Cache-Control": "no-store"}});
  const {key} = await params;
  if (!KEY_RE.test(key)) return nf();
  const item = await db.galleryItem.findFirst({where: {OR: [{fileKey: key}, {thumbKey: key}]}, select: {status: true, galleryYear: {select: {published: true}}}});
  if (!item) return nf();
  const isPublic = item.status === "PUBLISHED" && item.galleryYear.published;
  if (!isPublic) { try { await admin(); } catch { return nf(); } }
  const file = filePath(key);
  const s = await stat(file).catch(() => null); if (!s) return nf();
  const type = key.endsWith(".mp4") ? "video/mp4" : "image/webp";
  const base = {"Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": isPublic ? "public, max-age=604800, immutable" : "private, no-store", "X-Content-Type-Options": "nosniff"};
  const m = (req.headers.get("range") || "").match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : s.size - Number(m[2]), end = m[1] && m[2] ? Number(m[2]) : s.size - 1;
    start = Math.max(0, start); end = Math.min(s.size - 1, end);
    if (start > end || start >= s.size) return new Response(null, {status: 416, headers: {"Content-Range": `bytes */${s.size}`}});
    return new Response(Readable.toWeb(createReadStream(file, {start, end})) as ReadableStream, {status: 206, headers: {...base, "Content-Range": `bytes ${start}-${end}/${s.size}`, "Content-Length": String(end - start + 1)}});
  }
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {headers: {...base, "Content-Length": String(s.size)}});
}
