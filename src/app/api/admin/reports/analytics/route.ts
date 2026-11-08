import {NextRequest, NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {ANALYTICS_EVENTS} from "@/lib/analytics";
import {isoWibDate} from "@/lib/policy";

const day = (s: string | null, fallback: Date) => { if (!s) return fallback; const d = new Date(s + "T00:00:00Z"); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new HttpError(400, "BAD_DAY", "Use a valid YYYY-MM-DD date."); return d; };
/** NFR-10: aggregated daily funnel counters (WIB days). Contains no personal data. */
export async function GET(req: NextRequest) {
  try {
    await admin(["SUPER_ADMIN", "OPERATIONS", "SALES", "FINANCE", "VIEWER"]);
    const sp = req.nextUrl.searchParams, to = day(sp.get("to"), new Date(isoWibDate(new Date()) + "T00:00:00Z")), from = day(sp.get("from"), new Date(to.getTime() - 29 * 86400000));
    if (from > to || to.getTime() - from.getTime() > 366 * 86400000) throw new HttpError(400, "BAD_RANGE", "Range must be 1–367 days.");
    const rows = await db.analyticsDaily.findMany({where: {day: {gte: from, lte: to}}, orderBy: [{day: "asc"}, {event: "asc"}]});
    const days = new Map<string, Record<string, number>>();
    for (const r of rows) { const k = r.day.toISOString().slice(0, 10); (days.get(k) ?? days.set(k, {}).get(k)!)[r.event] = r.count; }
    const totals = Object.fromEntries(ANALYTICS_EVENTS.map(e => [e, rows.filter(r => r.event === e).reduce((a, r) => a + r.count, 0)]));
    return NextResponse.json({from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), timezone: "Asia/Jakarta", events: ANALYTICS_EVENTS, totals,
      days: [...days.entries()].map(([d, counts]) => ({day: d, counts}))}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
