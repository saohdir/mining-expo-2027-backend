import {NextRequest, NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {contentInput, KINDS} from "@/lib/content";
const READ = ["SUPER_ADMIN", "CONTENT_EDITOR", "OPERATIONS", "SALES", "FINANCE", "VIEWER"] as const;
/** CMS content list incl. drafts (authorized preview, FR-038) and draft creation (SUPER_ADMIN/CONTENT_EDITOR). */
export async function GET(req: NextRequest) {
  try {
    await admin([...READ]);
    const kind = req.nextUrl.searchParams.get("kind");
    if (kind && !(KINDS as readonly string[]).includes(kind)) throw new HttpError(400, "BAD_KIND", "Unknown kind.");
    const items = await db.contentItem.findMany({where: kind ? {kind} : {}, orderBy: [{kind: "asc"}, {sortOrder: "asc"}, {updatedAt: "desc"}], take: 500});
    return NextResponse.json({items}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
export async function POST(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN", "CONTENT_EDITOR"]);
    const x = contentInput.parse(await req.json());
    const item = await db.$transaction(async tx => {
      const c = await tx.contentItem.create({data: {...x, status: "DRAFT", updatedBy: actor.id}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "CONTENT_DRAFT_CREATED", resourceType: "ContentItem", resourceId: c.id, afterState: {kind: c.kind, locale: c.locale, slug: c.slug}}});
      return c;
    }).catch(e => { if ((e as {code?: string}).code === "P2002") throw new HttpError(409, "SLUG_EXISTS", "This slug already exists for the kind and locale."); throw e; });
    return NextResponse.json({item}, {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
