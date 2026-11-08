import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";
import {PAGE_KEYS, PAGE_MANIFEST, PAGE_PATHS} from "@/lib/page-layout";

/** Public pages that can be managed, with draft/published state. */
export async function GET() {
  try {
    await admin(["SUPER_ADMIN", "CONTENT_EDITOR", "OPERATIONS", "SALES", "FINANCE", "VIEWER"]);
    const rows = await db.pageLayout.findMany({select: {pageKey: true, locale: true, version: true, publishedAt: true, draftUpdatedAt: true}});
    return NextResponse.json({pages: PAGE_KEYS.map(k => ({key: k, path: PAGE_PATHS[k], sections: PAGE_MANIFEST[k].length,
      locales: rows.filter(r => r.pageKey === k).map(r => ({locale: r.locale, version: r.version, publishedAt: r.publishedAt, draftUpdatedAt: r.draftUpdatedAt,
        unpublishedChanges: !r.publishedAt || r.draftUpdatedAt > r.publishedAt}))}))}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
