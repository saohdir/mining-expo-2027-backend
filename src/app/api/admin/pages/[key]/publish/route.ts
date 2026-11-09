import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {LOCALES} from "@/lib/locales";
import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {layoutProblems, layoutSchema, PAGE_KEYS} from "@/lib/page-layout";

/** Publish the draft as a new immutable revision (audited, reason required). With CONTENT_APPROVAL_REQUIRED=true
 * publishing is a second-person approval step. */
export async function POST(req: NextRequest, {params}: {params: Promise<{key: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "CONTENT_EDITOR"]);
    const k = (await params).key; if (!PAGE_KEYS.includes(k)) throw new HttpError(404, "UNKNOWN_PAGE", "Unknown page.");
    const loc = z.enum(LOCALES).parse(req.nextUrl.searchParams.get("locale") || "en");
    const {reason} = z.object({reason: z.string().trim().min(8).max(300)}).strict().parse(await req.json());
    const out = await db.$transaction(async tx => {
      const row = await tx.pageLayout.findUnique({where: {pageKey_locale: {pageKey: k, locale: loc}}});
      if (!row) throw new HttpError(409, "NO_DRAFT", "Save a draft first.");
      // FR-041 role-based content approval (four-eyes, opt-in): the editor who last changed the draft cannot publish it.
      if (process.env.CONTENT_APPROVAL_REQUIRED === "true" && row.draftUpdatedBy === actor.id)
        throw new HttpError(409, "APPROVAL_REQUIRED", "Another editor or a Super Admin must review and publish this draft.");
      const layout = layoutSchema.parse(row.draft);
      const problems = layoutProblems(k, layout); if (problems.length) throw new HttpError(400, "INVALID_LAYOUT", problems.join("; "));
      const version = row.version + 1;
      await tx.pageRevision.create({data: {pageKey: k, locale: loc, version, layout: layout as Prisma.InputJsonValue, reason, publishedBy: actor.id}});
      await tx.pageLayout.update({where: {id: row.id}, data: {published: layout as Prisma.InputJsonValue, version, publishedAt: new Date(), publishedBy: actor.id}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "PAGE_PUBLISHED", resourceType: "PageLayout", resourceId: k + ":" + loc, afterState: {version, reason}}});
      return {version};
    });
    return NextResponse.json({published: true, ...out}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
