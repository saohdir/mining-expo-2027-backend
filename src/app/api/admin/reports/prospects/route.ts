import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import ExcelJS from "exceljs";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {safeCell} from "@/lib/policy";
import {activeEventCode} from "@/lib/active-event";
import {prospectExport, prospects, prospectSummary, type ProspectFilter} from "@/lib/prospects";

const q = z.object({event: z.string().max(40).optional(), type: z.enum(["VISITOR", "CONFERENCE", "EXHIBITOR"]).optional(), conferenceId: z.string().uuid().optional(),
  attended: z.enum(["yes", "no"]).optional(), q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1), format: z.enum(["json", "xlsx"]).default("json")});
const H = {headers: {"Cache-Control": "private,no-store"}};

/** Prospect report for next year's edition: visitors, conference delegates and exhibitors as people, with contact details.
 * Contact data is visible to Super Admin / Sales / Operations only; exports are audited. */
export async function GET(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN", "SALES", "OPERATIONS"]);
    const x = q.parse(Object.fromEntries(req.nextUrl.searchParams));
    const event = await db.event.findUnique({where: {code: x.event || activeEventCode()}});
    if (!event) throw new HttpError(404, "NOT_FOUND", "Event not found.");
    const f: ProspectFilter = {eventId: event.id, type: x.type, conferenceId: x.conferenceId, attended: x.attended, q: x.q || undefined};
    if (x.format === "xlsx") {
      const rows = await prospectExport(f);
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Prospects");
      ws.addRow([`IMDX prospects — ${event.title} · all registered participants · exported ${new Date().toISOString()}`]);
      const cols = ["Salutation", "Name", "Job title", "Company", "Email", "WhatsApp", "Country", "Participated as", "Conference programmes", "Exhibitor products", "Booth location", "Attended", "First check-in (UTC)", "Registered (UTC)"];
      ws.addRow(cols).font = {bold: true};
      for (const r of rows) ws.addRow([r.salutation, r.name, r.jobTitle, r.company, r.email, r.whatsapp, r.country, r.roles.join(", "), r.programmes.join("; "), r.exhibitorProducts, r.boothLocation,
        r.attended ? "Yes" : "No", r.firstCheckIn || "", r.registeredAt].map(v => safeCell(v)));
      ws.columns.forEach(c => { c.width = 22; }); ws.views = [{state: "frozen", ySplit: 2}]; ws.autoFilter = {from: {row: 2, column: 1}, to: {row: 2, column: cols.length}};
      await db.auditLog.create({data: {adminId: actor.id, action: "PROSPECTS_EXPORTED", resourceType: "Event", resourceId: event.id, afterState: {rows: rows.length, filters: {type: x.type, conferenceId: x.conferenceId, attended: x.attended, q: x.q}}}});
      return new NextResponse(Buffer.from(await wb.xlsx.writeBuffer()), {headers: {"Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="imdx-prospects.xlsx"`, "Cache-Control": "private,no-store"}});
    }
    const take = 50, [list, summary, conferences] = await Promise.all([prospects(f, {skip: (x.page - 1) * take, take}), prospectSummary(f), db.conference.findMany({where: {eventId: event.id}, select: {id: true, title: true}, orderBy: {startsAt: "asc"}})]);
    return NextResponse.json({event: event.title, filters: {...x, format: undefined}, page: x.page, pageSize: take, ...list, summary, conferences}, H);
  } catch (e) { return failure(e); }
}
