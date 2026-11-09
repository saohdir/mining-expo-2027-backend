import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {LOCALES} from "@/lib/locales";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {defaultLayout, layoutProblems, layoutSchema, PAGE_FIELDS, PAGE_KEYS, PAGE_MANIFEST, PAGE_PATHS, pruneLayout} from "@/lib/page-layout";

const locale = (req: NextRequest) => z.enum(LOCALES).parse(req.nextUrl.searchParams.get("locale") || "en");
const key = (k: string) => { if (!PAGE_KEYS.includes(k)) throw new HttpError(404, "UNKNOWN_PAGE", "Unknown page."); return k; };
/** Draft + published layout (draft is visible only to signed-in staff = authorized preview, FR-038). */
export async function GET(req: NextRequest, {params}: {params: Promise<{key: string}>}) {
  try {
    await admin(["SUPER_ADMIN", "CONTENT_EDITOR", "OPERATIONS", "SALES", "FINANCE", "VIEWER"]);
    const k = key((await params).key), loc = locale(req);
    const row = await db.pageLayout.findUnique({where: {pageKey_locale: {pageKey: k, locale: loc}}});
    const revisions = await db.pageRevision.findMany({where: {pageKey: k, locale: loc}, orderBy: {version: "desc"}, take: 20, select: {version: true, reason: true, publishedBy: true, publishedAt: true}});
    return NextResponse.json({key: k, path: PAGE_PATHS[k], locale: loc, sections: PAGE_MANIFEST[k], fields: PAGE_FIELDS[k] || {}, draft: row?.draft ? pruneLayout(k, row.draft) : defaultLayout(k), published: row?.published ? pruneLayout(k, row.published) : null,
      version: row?.version ?? 0, draftUpdatedAt: row?.draftUpdatedAt ?? null, publishedAt: row?.publishedAt ?? null, revisions}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
/** Save draft (SUPER_ADMIN / CONTENT_EDITOR). Public site is unchanged until publish. */
export async function PUT(req: NextRequest, {params}: {params: Promise<{key: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "CONTENT_EDITOR"]);
    const k = key((await params).key), loc = locale(req);
    const layout = layoutSchema.parse(await req.json());
    const problems = layoutProblems(k, layout);
    if (problems.length) throw new HttpError(400, "INVALID_LAYOUT", problems.join("; "));
    await db.$transaction([
      db.pageLayout.upsert({where: {pageKey_locale: {pageKey: k, locale: loc}}, update: {draft: layout, draftUpdatedAt: new Date(), draftUpdatedBy: actor.id},
        create: {pageKey: k, locale: loc, draft: layout, draftUpdatedBy: actor.id}}),
      db.auditLog.create({data: {adminId: actor.id, action: "PAGE_DRAFT_SAVED", resourceType: "PageLayout", resourceId: k + ":" + loc, afterState: {blocks: layout.blocks.length, fields: Object.keys(layout.fields || {}).length}}})]);
    return NextResponse.json({saved: true}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
