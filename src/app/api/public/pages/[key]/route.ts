import {NextRequest, NextResponse} from "next/server";
import {db} from "@/lib/db";
import {failure} from "@/lib/errors";
import {PAGE_KEYS} from "@/lib/page-layout";

/** Published layout only (drafts never public). null ⇒ show the page exactly as designed. Cached ≤60 s. */
export async function GET(req: NextRequest, {params}: {params: Promise<{key: string}>}) {
  try {
    const k = (await params).key;
    const cache = {"Cache-Control": "public, max-age=30, s-maxage=60"};
    if (!PAGE_KEYS.includes(k)) return NextResponse.json({layout: null}, {status: 404, headers: cache});
    const loc = req.nextUrl.searchParams.get("locale") === "id" ? "id" : "en";
    let row = await db.pageLayout.findUnique({where: {pageKey_locale: {pageKey: k, locale: loc}}, select: {published: true, version: true}});
    if (!row?.published && loc === "id") row = await db.pageLayout.findUnique({where: {pageKey_locale: {pageKey: k, locale: "en"}}, select: {published: true, version: true}});
    return NextResponse.json({layout: row?.published ?? null, version: row?.version ?? 0}, {headers: cache});
  } catch (e) { return failure(e); }
}
