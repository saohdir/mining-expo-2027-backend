import {toLocale} from "@/lib/locales";
import {NextRequest, NextResponse} from "next/server";
import {db} from "@/lib/db";
import {failure, HttpError} from "@/lib/errors";
import {KINDS} from "@/lib/content";
/** Published content only (FR-005/009/013/035/038); drafts are never exposed publicly. Not cached, so a publish shows on the website at once. */
export async function GET(req: NextRequest) {
  try {
    const kind = req.nextUrl.searchParams.get("kind") || "", locale = toLocale(req.nextUrl.searchParams.get("locale"));
    if (!(KINDS as readonly string[]).includes(kind)) throw new HttpError(400, "BAD_KIND", "Unknown content kind.");
    let items = await db.contentItem.findMany({where: {kind, locale, status: "PUBLISHED"}, orderBy: [{sortOrder: "asc"}, {publishedAt: "desc"}],
      select: {title: true, slug: true, summary: true, body: true, url: true, fileType: true, fileSizeBytes: true, imageUrl: true, altText: true, role: true, publishedAt: true, updatedAt: true, locale: true}});
    if (!items.length && locale !== "en") items = await db.contentItem.findMany({where: {kind, locale: "en", status: "PUBLISHED"}, orderBy: [{sortOrder: "asc"}, {publishedAt: "desc"}],
      select: {title: true, slug: true, summary: true, body: true, url: true, fileType: true, fileSizeBytes: true, imageUrl: true, altText: true, role: true, publishedAt: true, updatedAt: true, locale: true}}); // NFR-09 fallback
    return NextResponse.json({kind, locale, items}, {headers: {"Cache-Control": "public, max-age=0, must-revalidate"}});
  } catch (e) { return failure(e); }
}
