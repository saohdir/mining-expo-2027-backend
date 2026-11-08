import ExcelJS from "exceljs";
import {PDFDocument, StandardFonts, rgb} from "pdf-lib";
import type {AdminRole} from "@prisma/client";
import {HttpError} from "./errors";
import {safeCell} from "./policy";
import {booths, finance, registrations, type Dataset, SYNC_LIMIT} from "./report-datasets";

export const BASES: Record<string, string[]> = {registrations: ["created", "confirmed", "checkedIn"], booths: ["created", "assigned"], finance: ["created", "issued", "paid"]};
export type ExportRequest = {dataset: string; basis: string; format: "xlsx" | "pdf"; from?: string | null; to?: string | null; type?: string; status?: string; hall?: string; zone?: string; q?: string};
const day = (v: string | null | undefined, end: boolean) => {
  if (!v) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new HttpError(400, "BAD_DATE", "Dates must use YYYY-MM-DD WIB.");
  return new Date(Date.parse(v + "T00:00:00+07:00") + (end ? 86400000 : 0));
};
/** Validates an export request (shared by synchronous and background exports). */
export function validateExport(x: ExportRequest) {
  if (!BASES[x.dataset]) throw new HttpError(400, "BAD_DATASET", "Datasets: registrations, booths, finance.");
  if (!BASES[x.dataset].includes(x.basis)) throw new HttpError(400, "BAD_BASIS", "Date basis for " + x.dataset + ": " + BASES[x.dataset].join(", "));
  if (!["xlsx", "pdf"].includes(x.format)) throw new HttpError(400, "BAD_FORMAT", "Supported formats: xlsx, pdf.");
  if (x.type && !["VISITOR", "CONFERENCE", "EXHIBITOR"].includes(x.type)) throw new HttpError(400, "BAD_TYPE", "Unsupported type.");
  if (x.status && !/^[A-Z_]{3,20}$/.test(x.status)) throw new HttpError(400, "BAD_STATUS", "Unsupported status.");
  const from = day(x.from, false), to = day(x.to, true);
  if (from && to && from >= to) throw new HttpError(400, "BAD_RANGE", "End date must follow start date.");
  if (from && to && +to - +from > 366 * 86400000) throw new HttpError(400, "RANGE_TOO_LARGE", "Maximum report period is 366 days.");
  return {from, to};
}
export async function loadDataset(role: AdminRole, x: ExportRequest, limit = SYNC_LIMIT): Promise<Dataset> {
  const range = validateExport(x);
  return x.dataset === "booths" ? booths(role, x.basis, range, {status: x.status, hall: x.hall, zone: x.zone, q: x.q}, limit)
    : x.dataset === "finance" ? finance(role, x.basis, range, {status: x.status, q: x.q}, limit)
    : registrations(role, x.basis, range, {type: x.type, status: x.status, q: x.q}, limit);
}
/** Renders XLSX (typed numbers, formula-safe text, filter header) or landscape PDF with summary. */
export async function render(data: Dataset, x: ExportRequest) {
  const header = `IMDX 2027 — ${data.sheet} · basis ${x.basis} · period (WIB, inclusive) ${x.from || "start"} to ${x.to || "now"} · ${data.rows.length} rows · exported ${new Date().toISOString()}`;
  if (x.format === "xlsx") {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(data.sheet);
    ws.addRow([header]); ws.addRow(data.columns);
    for (const row of data.rows) ws.addRow(row.map(v => typeof v === "number" ? v : safeCell(v)));
    ws.getRow(2).font = {bold: true}; ws.columns.forEach(c => { c.width = 24; }); ws.views = [{state: "frozen", ySplit: 2}];
    return {bytes: Buffer.from(await wb.xlsx.writeBuffer()), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx"};
  }
  if (data.rows.length > 20000) throw new HttpError(413, "PDF_TOO_LARGE", "PDF exports are limited to 20,000 rows; use XLSX.");
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([842, 595]), y = 565;
  const line = (s: string, size = 8) => { if (y < 30) { page = pdf.addPage([842, 595]); y = 565; } page.drawText(s.replace(/[^\x20-\x7E]/g, "?").slice(0, 190), {x: 30, y, size, font, color: rgb(.2, .16, .13)}); y -= size + 6; };
  line(header, 10); line(data.columns.join(" | "), 8);
  for (const r of data.rows) line(r.map(v => safeCell(v)).join(" | "));
  line("Summary: " + data.rows.length + " rows. Amounts in IDR minor units.", 9);
  return {bytes: Buffer.from(await pdf.save()), contentType: "application/pdf", ext: "pdf"};
}
