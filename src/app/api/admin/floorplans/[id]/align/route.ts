import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {outOfCanvas} from "@/lib/floorplan-geometry";

const schema = z.object({rowVersion: z.number().int().positive(), scale: z.number().min(0.1).max(10), dx: z.number().min(-10000).max(10000), dy: z.number().min(-10000).max(10000), reason: z.string().min(8).max(300)}).strict();
/** FR-098 Align tool: global scale + offset of placed units after a background change. */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params; z.string().uuid().parse(id);
    const x = schema.parse(await req.json());
    const out = await db.$transaction(async tx => {
      const plan = await tx.floorplan.findUnique({where: {id}, include: {units: {where: {placed: true}}}});
      if (!plan) throw new HttpError(404, "NOT_FOUND", "Floorplan missing.");
      if (plan.status !== "DRAFT") throw new HttpError(409, "NOT_DRAFT", "Align only a draft.");
      if (plan.rowVersion !== x.rowVersion) throw new HttpError(409, "VERSION_CONFLICT", "Floorplan changed; reload.");
      const moved = plan.units.map(u => ({...u, x: Math.round((u.x * x.scale + x.dx) * 10) / 10, y: Math.round((u.y * x.scale + x.dy) * 10) / 10, w: Math.round(u.w * x.scale * 10) / 10, h: Math.round(u.h * x.scale * 10) / 10}));
      const bad = moved.filter(u => outOfCanvas(u, plan.canvasWidth, plan.canvasHeight)).map(u => u.code);
      if (bad.length) throw new HttpError(400, "OUT_OF_BOUNDS", "Alignment would move units off the canvas: " + bad.slice(0, 10).join(", "));
      for (const u of moved) await tx.boothUnit.update({where: {id: u.id}, data: {x: u.x, y: u.y, w: u.w, h: u.h}});
      await tx.floorplan.update({where: {id}, data: {rowVersion: {increment: 1}}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "FLOORPLAN_ALIGNED", resourceType: "Floorplan", resourceId: id, afterState: {scale: x.scale, dx: x.dx, dy: x.dy, units: moved.length, reason: x.reason}}});
      return {aligned: moved.length, rowVersion: plan.rowVersion + 1};
    }, {isolationLevel: "Serializable"});
    return NextResponse.json(out, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
