import {NextRequest, NextResponse} from "next/server";
import {db} from "@/lib/db";
import {failure, HttpError} from "@/lib/errors";
import {requireEnabled} from "@/lib/policy";
import {DISCLAIMER, ESTIMATOR_KEY, estimate, tariffSchema} from "@/lib/fee-estimator";

/** FR-159: read-only estimate (never stores, reserves or prices anything). Without ?area it lists categories/packages. */
export async function GET(req: NextRequest) {
  try {
    requireEnabled("feeEstimator");
    const s = await db.appSetting.findUnique({where: {key: ESTIMATOR_KEY}});
    if (!s) throw new HttpError(503, "TARIFFS_NOT_APPROVED", "Booth tariffs are not published yet.");
    const t = tariffSchema.parse(JSON.parse(s.value));
    const sp = req.nextUrl.searchParams, H = {headers: {"Cache-Control": "public,max-age=60"}};
    if (!sp.get("area")) return NextResponse.json({categories: t.categories.map(c => ({name: c.name, perSqmMinor: c.perSqmMinor, minimumSqm: c.minimumSqm})), packages: t.packages, taxNote: t.taxNote, disclaimer: DISCLAIMER}, H);
    const area = Number(sp.get("area"));
    if (!Number.isFinite(area) || area < 1 || area > 10000) throw new HttpError(400, "BAD_AREA", "Area must be between 1 and 10,000 m².");
    const out = estimate(t, area, (sp.get("category") || t.categories[0].name).slice(0, 60));
    if (!out) throw new HttpError(404, "UNKNOWN_CATEGORY", "Unknown booth category.");
    return NextResponse.json(out, H);
  } catch (e) { return failure(e); }
}
