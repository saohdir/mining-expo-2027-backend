import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {safeCell} from "@/lib/policy";
import {activeEventCode} from "@/lib/active-event";
import {parseCsv} from "@/lib/preregistration";

type Row = {email: string; name: string; status: string};
/** FR-154 scanned-ID reconciliation: compare who actually arrived (admissions) with an expected list —
 * the pre-registration invitations by default, or an uploaded list of e-mails (e.g. from a partner or badge printer).
 * Results: expected & arrived, expected not arrived, arrived not expected. Operations/Super Admin only; audited. */
export async function POST(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const x = z.object({csv: z.string().max(400000).optional(), format: z.enum(["json", "csv"]).default("json"), eventCode: z.string().default(activeEventCode)}).strict().parse(await req.json());
    const event = await db.event.findUnique({where: {code: x.eventCode}});
    if (!event) throw new HttpError(404, "NOT_FOUND", "Event not found.");
    let expected: Map<string, string>;
    if (x.csv) {
      const rows = parseCsv(x.csv); const h = rows[0]?.map(c => c.trim().toLowerCase()) || []; const i = h.indexOf("email");
      if (i < 0) throw new HttpError(400, "EMAIL_COLUMN_REQUIRED", "The CSV needs an 'email' column.");
      const n = h.indexOf("full_name") >= 0 ? h.indexOf("full_name") : h.indexOf("name");
      expected = new Map(rows.slice(1).map(r => [String(r[i] || "").trim().toLowerCase(), n >= 0 ? String(r[n] || "").trim() : ""] as [string, string]).filter(([e]) => e.includes("@")));
    } else {
      const inv = await db.invitation.findMany({where: {kind: "PREREGISTERED_VISITOR", eventId: event.id, status: {in: ["INVITED", "ACCEPTED"]}}, select: {email: true, fullName: true}});
      expected = new Map(inv.map(r => [r.email, r.fullName]));
    }
    const arrivedRows = await db.admission.findMany({where: {pass: {eventId: event.id}}, select: {pass: {select: {account: {select: {email: true, profile: {select: {fullName: true}}}}}}}});
    const arrived = new Map(arrivedRows.filter(a => a.pass.account.email).map(a => [a.pass.account.email!.toLowerCase(), a.pass.account.profile?.fullName || ""]));
    const out: Row[] = [];
    for (const [email, name] of expected) out.push({email, name, status: arrived.has(email) ? "EXPECTED_ARRIVED" : "EXPECTED_NOT_ARRIVED"});
    for (const [email, name] of arrived) if (!expected.has(email)) out.push({email, name, status: "ARRIVED_NOT_EXPECTED"});
    const counts = Object.fromEntries(["EXPECTED_ARRIVED", "EXPECTED_NOT_ARRIVED", "ARRIVED_NOT_EXPECTED"].map(s => [s, out.filter(r => r.status === s).length]));
    await db.auditLog.create({data: {adminId: actor.id, action: "RECONCILIATION_RUN", resourceType: "Event", resourceId: event.id, afterState: {source: x.csv ? "upload" : "preregistration", counts}}});
    if (x.format === "csv") return new NextResponse("status,email,name\n" + out.map(r => [r.status, r.email, r.name].map(v => '"' + safeCell(v).replace(/"/g, '""') + '"').join(",")).join("\n") + "\n",
      {headers: {"Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=\"imdx-reconciliation.csv\"", "Cache-Control": "private,no-store"}});
    return NextResponse.json({counts, rows: out.slice(0, 500), truncated: out.length > 500}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
