import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {LOCALES} from "@/lib/locales";
import {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {PAGE_KEYS} from "@/lib/page-layout";

/** Restore an earlier published revision as a NEW published version (history is never rewritten).
 * version 0 = restore the original designed page (no CMS overrides). */
export async function POST(req: NextRequest, {params}: {params: Promise<{key: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "CONTENT_EDITOR"]);
    const k = (await params).key; if (!PAGE_KEYS.includes(k)) throw new HttpError(404, "UNKNOWN_PAGE", "Unknown page.");
    const loc = z.enum(LOCALES).parse(req.nextUrl.searchParams.get("locale") || "en");
    const x = z.object({version: z.number().int().min(0), reason: z.string().trim().min(8).max(300)}).strict().parse(await req.json());
    const out = await db.$transaction(async tx => {
      const row = await tx.pageLayout.findUnique({where: {pageKey_locale: {pageKey: k, locale: loc}}});
      if (!row) throw new HttpError(409, "NOTHING_PUBLISHED", "Nothing to roll back.");
      const target = x.version === 0 ? null : await tx.pageRevision.findUnique({where: {pageKey_locale_version: {pageKey: k, locale: loc, version: x.version}}});
      if (x.version !== 0 && !target) throw new HttpError(404, "NO_REVISION", "Revision not found.");
      const version = row.version + 1;
      const layout = (target?.layout ?? null) as Prisma.InputJsonValue | null;
      await tx.pageRevision.create({data: {pageKey: k, locale: loc, version, layout: layout ?? {restoredDesign: true}, reason: "ROLLBACK to v" + x.version + ": " + x.reason, publishedBy: actor.id}});
      await tx.pageLayout.update({where: {id: row.id}, data: {published: layout ?? Prisma.DbNull, ...(layout ? {draft: layout} : {}), version, publishedAt: new Date(), publishedBy: actor.id}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "PAGE_ROLLED_BACK", resourceType: "PageLayout", resourceId: k + ":" + loc, afterState: {to: x.version, version, reason: x.reason}}});
      return {version};
    });
    return NextResponse.json({rolledBack: true, ...out}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
