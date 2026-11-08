import {NextRequest, NextResponse} from "next/server";
import {activeEventCode} from "@/lib/active-event";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";

import {categoryInput} from "@/lib/booth-category";

/** FR-092 booth categories. Read for floorplan roles; write SUPER_ADMIN/OPERATIONS. */
export async function GET(req: NextRequest) {
  try {
    await admin(["SUPER_ADMIN", "OPERATIONS", "SALES", "FINANCE"]);
    const event = await db.event.findUnique({where: {code: req.nextUrl.searchParams.get("event") || activeEventCode()}});
    if (!event) throw new HttpError(404, "NOT_FOUND", "Event not found.");
    const categories = await db.boothCategory.findMany({where: {eventId: event.id}, orderBy: [{sortOrder: "asc"}, {name: "asc"}], include: {_count: {select: {units: true}}}});
    return NextResponse.json({categories}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
export async function POST(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const x = categoryInput.parse(await req.json());
    const event = await db.event.findUnique({where: {code: req.nextUrl.searchParams.get("event") || activeEventCode()}});
    if (!event) throw new HttpError(404, "NOT_FOUND", "Event not found.");
    const c = await db.$transaction(async tx => {
      const row = await tx.boothCategory.create({data: {eventId: event.id, ...x}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "BOOTH_CATEGORY_CREATED", resourceType: "BoothCategory", resourceId: row.id, afterState: x}});
      return row;
    }).catch(e => { if ((e as {code?: string}).code === "P2002") throw new HttpError(409, "CATEGORY_EXISTS", "Category name already exists."); throw e; });
    return NextResponse.json({category: c}, {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
