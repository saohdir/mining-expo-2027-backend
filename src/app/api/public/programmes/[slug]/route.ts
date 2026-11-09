import {NextRequest, NextResponse} from "next/server";
import {failure} from "@/lib/errors";
import {toLocale} from "@/lib/locales";
import {admin} from "@/lib/auth";
import {detail, itemBySlug} from "@/lib/programme-data";
import {slugSchema} from "@/lib/programme";

/** One programme page. Drafts only with ?preview=1 for signed-in CMS staff (never cached). Unknown/unpublished → 404. */
export async function GET(req: NextRequest, {params}: {params: Promise<{slug: string}>}) {
  try {
    const {slug} = await params;
    const locale = toLocale(req.nextUrl.searchParams.get("locale"));
    const notFound = NextResponse.json({error: "NOT_FOUND", message: "Programme not found."}, {status: 404, headers: {"Cache-Control": "no-store"}});
    if (!slugSchema.safeParse(slug).success) return notFound;
    let preview = false;
    if (req.nextUrl.searchParams.get("preview") === "1") { try { await admin(); preview = true; } catch { preview = false; } }
    const item = await itemBySlug(slug, preview);
    const d = item && await detail(item, locale);
    if (!d) return notFound;
    return NextResponse.json({preview, status: item!.status, item: d}, {headers: {"Cache-Control": preview ? "private, no-store" : "public, max-age=15, s-maxage=30"}});
  } catch (e) { return failure(e); }
}
