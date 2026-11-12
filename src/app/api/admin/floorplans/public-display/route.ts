import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";
import {PUBLIC_DISPLAY_KEY, publicDisplay} from "@/lib/floorplan-public";

/** Read / change how booked booths appear on the public floor plan (company names or only "Not available"). */
export async function GET() {
  try {
    await admin(["SUPER_ADMIN", "OPERATIONS", "SALES", "FINANCE"]);
    return NextResponse.json({display: await publicDisplay()}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
export async function PUT(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const x = z.object({display: z.enum(["names", "status"]), reason: z.string().trim().max(300).optional()}).strict().parse(await req.json());
    const before = await publicDisplay();
    await db.$transaction(async tx => {
      await tx.appSetting.upsert({where: {key: PUBLIC_DISPLAY_KEY}, update: {value: x.display, updatedBy: actor.id}, create: {key: PUBLIC_DISPLAY_KEY, value: x.display, updatedBy: actor.id}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "FLOORPLAN_PUBLIC_DISPLAY", resourceType: "AppSetting", resourceId: PUBLIC_DISPLAY_KEY,
        beforeState: {display: before}, afterState: {display: x.display, reason: x.reason || null}}});
    });
    return NextResponse.json({display: x.display}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
