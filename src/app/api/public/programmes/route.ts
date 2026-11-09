import {NextRequest, NextResponse} from "next/server";
import {failure} from "@/lib/errors";
import {toLocale} from "@/lib/locales";
import {card, publishedItems} from "@/lib/programme-data";

/** Published programme cards, deterministic order (regular → legacy, displayOrder, createdAt, id). Paging is done by the page (3 per page). */
export async function GET(req: NextRequest) {
  try {
    const locale = toLocale(req.nextUrl.searchParams.get("locale"));
    const items = (await publishedItems()).map(i => card(i, locale)).filter(Boolean);
    return NextResponse.json({locale, pageSize: 3, items}, {headers: {"Cache-Control": "public, max-age=15, s-maxage=30"}});
  } catch (e) { return failure(e); }
}
