import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {floorOccupancy} from "@/lib/floor-occupancy";

/** Who booked each booth on this floor (company, contact, source) and who asked for it. Staff only. */
export async function GET(_req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    await admin(["SUPER_ADMIN", "OPERATIONS", "SALES", "FINANCE"]);
    const {id} = await params; z.string().uuid().parse(id);
    if (!await db.floorplan.count({where: {id}})) throw new HttpError(404, "NOT_FOUND", "Floorplan missing.");
    const units = await floorOccupancy(id);
    const sum = (f: (u: (typeof units)[number]) => boolean) => Math.round(units.filter(f).reduce((s, u) => s + u.areaSqm, 0) * 10) / 10;
    return NextResponse.json({units, summary: {booths: units.length, booked: units.filter(u => u.occupant).length,
      available: units.filter(u => u.status === "AVAILABLE" && !u.occupant).length, bookedArea: sum(u => !!u.occupant), availableArea: sum(u => u.status === "AVAILABLE" && !u.occupant)}},
      {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
