import {NextRequest} from "next/server";
import {admin} from "@/lib/auth";
import {itemBySlug} from "@/lib/programme-data";
import {slugSchema} from "@/lib/programme";

/** Nginx auth_request target for /programme/<slug>/ (and /zh/…): 204 when the page exists (published, or any non-deleted page for
 * signed-in CMS staff previewing), 403 otherwise — Nginx turns 403 into a real 404 page. Never returns content. */
export async function GET(req: NextRequest) {
  const uri = req.headers.get("x-original-uri") || "";
  const m = uri.match(/^(?:\/zh)?\/programme\/([^/?#]+)\/?(?:[?#].*)?$/);
  const slug = m?.[1] || "";
  const res = (ok: boolean) => new Response(null, {status: ok ? 204 : 403, headers: {"Cache-Control": "no-store"}});
  if (!slugSchema.safeParse(slug).success) return res(false);
  if (await itemBySlug(slug)) return res(true);
  try { await admin(); return res(!!(await itemBySlug(slug, true))); } catch { return res(false); }
}
