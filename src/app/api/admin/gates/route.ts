import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";

const ZONE = z.string().regex(/^[A-Z0-9_]{2,40}$/);
const create = z.object({eventCode: z.string().default("IMDX-2027"), code: z.string().regex(/^[A-Za-z0-9_-]{1,30}$/), name: z.string().min(2).max(80), zones: z.array(ZONE).min(1).max(10)}).strict();

/** Gates and assigned staff (FR-081). CHECKIN_STAFF only sees gates assigned to them. */
export async function GET(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS", "CHECKIN_STAFF"]);
    const event = await db.event.findUnique({where: {code: req.nextUrl.searchParams.get("event") || "IMDX-2027"}});
    if (!event) throw new HttpError(404, "NOT_FOUND", "Event not found.");
    const gates = await db.gate.findMany({where: {eventId: event.id, ...(actor.role === "CHECKIN_STAFF" ? {active: true, staff: {some: {adminId: actor.id}}} : {})},
      orderBy: {code: "asc"}, include: {staff: actor.role === "CHECKIN_STAFF" ? false : {select: {adminId: true}}}});
    const policies = await db.admissionPolicy.findMany({where: {eventId: event.id}, select: {zone: true, reentry: true}});
    return NextResponse.json({gates, policies}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
export async function POST(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const x = create.parse(await req.json());
    const event = await db.event.findUnique({where: {code: x.eventCode}});
    if (!event) throw new HttpError(404, "NOT_FOUND", "Event not found.");
    const gate = await db.$transaction(async tx => {
      const g = await tx.gate.create({data: {eventId: event.id, code: x.code, name: x.name, zones: [...new Set(x.zones)]}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "GATE_CREATED", resourceType: "Gate", resourceId: g.id, afterState: {code: g.code, zones: g.zones}}});
      return g;
    }).catch(e => { if ((e as {code?: string}).code === "P2002") throw new HttpError(409, "GATE_EXISTS", "Gate code already exists."); throw e; });
    return NextResponse.json({gate}, {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
