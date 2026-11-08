import {NextRequest, NextResponse} from "next/server";
import ExcelJS from "exceljs";
import {PDFDocument, StandardFonts, rgb} from "pdf-lib";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {safeCell} from "@/lib/policy";
import {booths, finance, registrations, type Dataset} from "@/lib/report-datasets";
export const runtime = "nodejs";

const BASES: Record<string, string[]> = {registrations: ["created", "confirmed", "checkedIn"], booths: ["created", "assigned"], finance: ["created", "issued", "paid"]};
function parseDate(v: string | null, end: boolean) {
  if (!v) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new HttpError(400, "BAD_DATE", "Dates must use YYYY-MM-DD WIB.");
  return new Date(Date.parse(v + "T00:00:00+07:00") + (end ? 86400000 : 0)); // inclusive WIB days
}

/** FR-031/067/121/122, AT-070–072: role-scoped XLSX/PDF exports with explicit date basis (WIB, inclusive),
 * formula-safe cells, and an ExportJob + audit record per export. */
export async function GET(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN", "FINANCE", "OPERATIONS", "SALES"]);
    const p = req.nextUrl.searchParams;
    const dataset = p.get("dataset") || "registrations", basis = p.get("basis") || "created", fmt = p.get("format") || "xlsx";
    if (!BASES[dataset]) throw new HttpError(400, "BAD_DATASET", "Datasets: registrations, booths, finance.");
    if (!BASES[dataset].includes(basis)) throw new HttpError(400, "BAD_BASIS", "Date basis for " + dataset + ": " + BASES[dataset].join(", "));
    if (!["xlsx", "pdf"].includes(fmt)) throw new HttpError(400, "BAD_FORMAT", "Supported formats: xlsx, pdf.");
    const from = parseDate(p.get("from"), false), to = parseDate(p.get("to"), true);
    if (from && to && from >= to) throw new HttpError(400, "BAD_RANGE", "End date must follow start date.");
    if (from && to && +to - +from > 366 * 86400000) throw new HttpError(400, "RANGE_TOO_LARGE", "Maximum report period is 366 days.");
    const opt = (k: string) => p.get(k)?.trim().slice(0, 120) || undefined;
    const status = opt("status"), type = opt("type");
    if (type && !["VISITOR", "CONFERENCE", "EXHIBITOR"].includes(type)) throw new HttpError(400, "BAD_TYPE", "Unsupported type.");
    if (status && !/^[A-Z_]{3,20}$/.test(status)) throw new HttpError(400, "BAD_STATUS", "Unsupported status.");
    const range = {from, to};
    const data: Dataset = dataset === "booths" ? await booths(actor.role, basis, range, {status, hall: opt("hall"), zone: opt("zone"), q: opt("q")})
      : dataset === "finance" ? await finance(actor.role, basis, range, {status, q: opt("q")})
      : await registrations(actor.role, basis, range, {type, status, q: opt("q")});
    const filters = {dataset, basis, from: p.get("from"), to: p.get("to"), type, status, hall: opt("hall"), zone: opt("zone"), q: opt("q"), timezone: "Asia/Jakarta"};
    const job = await db.exportJob.create({data: {adminId: actor.id, reportType: dataset.toUpperCase(), filters, format: fmt, state: "COMPLETED", rowCount: data.rows.length, expiresAt: new Date(Date.now() + 3600000)}});
    await db.auditLog.create({data: {adminId: actor.id, action: "REPORT_EXPORTED", resourceType: "ExportJob", resourceId: job.id, afterState: {format: fmt, rows: data.rows.length, filters}}});
    const header = `IMDX 2027 — ${data.sheet} · basis ${basis} · period (WIB, inclusive) ${p.get("from") || "start"} to ${p.get("to") || "now"} · ${data.rows.length} rows · exported ${new Date().toISOString()}`;
    const name = `imdx-${dataset}-${(p.get("from") || "all")}-${(p.get("to") || "all")}`;
    if (fmt === "xlsx") {
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(data.sheet);
      ws.addRow([header]); ws.addRow(data.columns);
      for (const row of data.rows) ws.addRow(row.map(v => typeof v === "number" ? v : safeCell(v)));
      ws.getRow(2).font = {bold: true}; ws.columns.forEach(c => { c.width = 24; }); ws.views = [{state: "frozen", ySplit: 2}];
      return new NextResponse(new Uint8Array(await wb.xlsx.writeBuffer()), {headers: {"Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}.xlsx"`, "Cache-Control": "private,no-store", "X-Export-Rows": String(data.rows.length)}});
    }
    const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
    let page = pdf.addPage([842, 595]), y = 565;
    const line = (s: string, size = 8) => { if (y < 30) { page = pdf.addPage([842, 595]); y = 565; } page.drawText(s.replace(/[^\x20-\x7E]/g, "?").slice(0, 190), {x: 30, y, size, font, color: rgb(.2, .16, .13)}); y -= size + 6; };
    line(header, 10); line(data.columns.join(" | "), 8);
    for (const r of data.rows) line(r.map(v => safeCell(v)).join(" | "));
    line("Summary: " + data.rows.length + " rows. Amounts in IDR minor units.", 9);
    return new NextResponse(new Uint8Array(await pdf.save()), {headers: {"Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"`, "Cache-Control": "private,no-store", "X-Export-Rows": String(data.rows.length)}});
  } catch (e) { return failure(e); }
}
