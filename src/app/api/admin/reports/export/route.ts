import {NextRequest, NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";
import {loadDataset, render, type ExportRequest} from "@/lib/export-build";
export const runtime = "nodejs";

/** Synchronous export ≤2,000 rows (FR-031/067/121, AT-070–072). Larger: POST /api/admin/exports (background). */
export async function GET(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN", "FINANCE", "OPERATIONS", "SALES"]);
    const p = req.nextUrl.searchParams, opt = (k: string) => p.get(k)?.trim().slice(0, 120) || undefined;
    const x: ExportRequest = {dataset: p.get("dataset") || "registrations", basis: p.get("basis") || "created", format: (p.get("format") || "xlsx") as "xlsx",
      from: p.get("from"), to: p.get("to"), type: opt("type"), status: opt("status"), hall: opt("hall"), zone: opt("zone"), q: opt("q")};
    const data = await loadDataset(actor.role, x);
    const filters = {...x, timezone: "Asia/Jakarta"};
    const job = await db.exportJob.create({data: {adminId: actor.id, reportType: x.dataset.toUpperCase(), filters, format: x.format, state: "COMPLETED", rowCount: data.rows.length, expiresAt: new Date(Date.now() + 3600000)}});
    await db.auditLog.create({data: {adminId: actor.id, action: "REPORT_EXPORTED", resourceType: "ExportJob", resourceId: job.id, afterState: {format: x.format, rows: data.rows.length, filters}}});
    const out = await render(data, x);
    return new NextResponse(new Uint8Array(out.bytes), {headers: {"Content-Type": out.contentType, "Content-Disposition": `attachment; filename="imdx-${x.dataset}-${x.from || "all"}-${x.to || "all"}.${out.ext}"`,
      "Cache-Control": "private,no-store", "X-Export-Rows": String(data.rows.length)}});
  } catch (e) { return failure(e); }
}
