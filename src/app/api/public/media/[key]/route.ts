import {NextRequest, NextResponse} from "next/server";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {failure, HttpError} from "@/lib/errors";
import {db} from "@/lib/db";
import {attachmentHeader, downloadFileName} from "@/lib/download-name";
export const runtime = "nodejs";
export async function GET(req: NextRequest, {params}: {params: Promise<{key: string}>}) {
  try {
    const {key} = await params;
    if (!/^[0-9a-f-]{36}\.(webp|pdf)$/.test(key)) throw new HttpError(404, "NOT_FOUND", "Not found.");
    const pdf = key.endsWith(".pdf");
    const dir = process.env.MEDIA_UPLOAD_DIR || path.join(process.env.FLOORPLAN_UPLOAD_DIR || path.resolve(".data/floorplans"), "../media");
    const bytes = await readFile(path.join(dir, key)).catch(() => { throw new HttpError(404, "NOT_FOUND", "Not found."); });
    // ?download=1 (Exhibitor downloads): save under the published document's CMS title instead of the storage key.
    // The name comes from the database, never from the request, and is resolved on every request so a CMS rename applies.
    let disposition = pdf ? "inline" : undefined;
    if (pdf && req.nextUrl.searchParams.get("download") === "1") {
      const lang = req.nextUrl.searchParams.get("lang") === "zh" ? "zh" : "en";
      const items = await db.contentItem.findMany({where: {kind: "DOWNLOAD", status: "PUBLISHED", url: "/api/public/media/" + key}, select: {title: true, locale: true}, orderBy: {updatedAt: "desc"}});
      const item = items.find(i => i.locale === lang) || items.find(i => i.locale === "en") || items[0];
      disposition = attachmentHeader(downloadFileName(item?.title, "pdf"));
    }
    return new NextResponse(new Uint8Array(bytes), {headers: {"Content-Type": pdf ? "application/pdf" : "image/webp", "Cache-Control": disposition?.startsWith("attachment") ? "public, max-age=300" : "public, max-age=86400, immutable", "X-Content-Type-Options": "nosniff",
      ...(pdf ? {"Content-Disposition": disposition!, "Content-Security-Policy": "sandbox"} : {})}});
  } catch (e) { return failure(e); }
}
