import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {categoryInput} from "@/lib/booth-category";

export async function PATCH(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params; z.string().uuid().parse(id);
    const x = categoryInput.partial().parse(await req.json());
    const out = await db.$transaction(async tx => {
      const before = await tx.boothCategory.findUnique({where: {id}});
      if (!before) throw new HttpError(404, "NOT_FOUND", "Category missing.");
      const row = await tx.boothCategory.update({where: {id}, data: x});
      if (x.name && x.name !== before.name) await tx.boothUnit.updateMany({where: {categoryId: id, floorplan: {status: "DRAFT"}}, data: {category: x.name}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "BOOTH_CATEGORY_UPDATED", resourceType: "BoothCategory", resourceId: id, beforeState: {name: before.name, colorHex: before.colorHex, pattern: before.pattern}, afterState: x}});
      return row;
    });
    return NextResponse.json({category: out}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
export async function DELETE(_req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const {id} = await params; z.string().uuid().parse(id);
    await db.$transaction(async tx => {
      if (await tx.boothUnit.count({where: {categoryId: id}})) throw new HttpError(409, "CATEGORY_IN_USE", "Reassign units before deleting this category.");
      await tx.boothCategory.delete({where: {id}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "BOOTH_CATEGORY_DELETED", resourceType: "BoothCategory", resourceId: id}});
    });
    return NextResponse.json({deleted: true}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
