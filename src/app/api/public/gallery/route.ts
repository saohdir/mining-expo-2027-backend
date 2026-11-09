import {NextRequest, NextResponse} from "next/server";
import {db} from "@/lib/db";
import {failure} from "@/lib/errors";
import {toLocale} from "@/lib/locales";
import {PAGE_SIZE, publicItem} from "@/lib/gallery";

/** Published, compressed gallery items of one year (default: newest year with items), 12 per page, plus the year buttons. */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams, locale = toLocale(sp.get("locale"));
    const live = {status: "PUBLISHED", processing: "READY", galleryYear: {published: true}};
    const counts = await db.galleryItem.groupBy({by: ["year"], where: live, _count: {_all: true}});
    const meta = await db.galleryYear.findMany({where: {year: {in: counts.map(c => c.year)}}, select: {year: true, label: true}});
    const years = counts.map(c => ({year: c.year, label: meta.find(m => m.year === c.year)?.label || String(c.year), count: c._count._all})).sort((a, b) => b.year - a.year);
    const asked = Number(sp.get("year"));
    const year = years.find(y => y.year === asked)?.year ?? years[0]?.year ?? null;
    const total = year ? years.find(y => y.year === year)!.count : 0;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE)), n = Math.trunc(Number(sp.get("page")));
    const page = Number.isFinite(n) ? Math.min(pages, Math.max(1, n)) : 1;
    const items = year ? await db.galleryItem.findMany({where: {...live, year}, orderBy: [{sortOrder: "asc"}, {createdAt: "asc"}, {id: "asc"}], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE}) : [];
    return NextResponse.json({locale, years, year, page, pages, pageSize: PAGE_SIZE, total, items: items.map(i => publicItem(i, locale))}, {headers: {"Cache-Control": "public, max-age=15, s-maxage=30"}});
  } catch (e) { return failure(e); }
}
