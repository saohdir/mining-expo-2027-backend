import {NextRequest, NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";
import {publishProblems} from "@/lib/gallery";

/** CMS: years with counts and the items of one year (24 per page), drafts included. */
export async function GET(req: NextRequest) {
  try {
    await admin(["SUPER_ADMIN", "CONTENT_EDITOR", "OPERATIONS", "SALES", "FINANCE", "VIEWER"]);
    const sp = req.nextUrl.searchParams;
    const years = await db.galleryYear.findMany({orderBy: [{year: "desc"}]});
    const counts = await db.galleryItem.groupBy({by: ["year", "status"], _count: {_all: true}});
    const year = Number(sp.get("year")) || years[0]?.year || null, status = sp.get("status") || "", size = 24;
    const where = {year: year ?? -1, ...(status ? {status} : {})};
    const total = await db.galleryItem.count({where});
    const pages = Math.max(1, Math.ceil(total / size)), page = Math.min(pages, Math.max(1, Number(sp.get("page")) || 1));
    const items = await db.galleryItem.findMany({where, orderBy: [{sortOrder: "asc"}, {createdAt: "asc"}], skip: (page - 1) * size, take: size});
    return NextResponse.json({years: years.map(y => ({...y, total: counts.filter(c => c.year === y.year).reduce((s, c) => s + c._count._all, 0), liveCount: counts.find(c => c.year === y.year && c.status === "PUBLISHED")?._count._all ?? 0})),
      year, page, pages, total, items: items.map(i => ({...i, problems: publishProblems(i)}))}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
