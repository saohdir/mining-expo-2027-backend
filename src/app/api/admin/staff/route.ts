import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {AdminRole} from "@prisma/client";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {hashPassword, safeEmail} from "@/lib/security";

/** FR-147 staff directory: SUPER_ADMIN manages; OPERATIONS reads (for gate assignment). No password data. */
export async function GET() {
  try {
    const actor = await admin(["SUPER_ADMIN", "OPERATIONS"]);
    const staff = await db.adminUser.findMany({where: actor.role === "OPERATIONS" ? {active: true} : {}, orderBy: {email: "asc"},
      select: {id: true, email: true, role: true, active: true, createdAt: true, _count: {select: {sessions: true}}}});
    return NextResponse.json({staff}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
const create = z.object({email: z.string().email(), role: z.nativeEnum(AdminRole), temporaryPassword: z.string().min(14).max(200), reason: z.string().min(8).max(300)}).strict();
export async function POST(req: NextRequest) {
  try {
    const actor = await admin(["SUPER_ADMIN"]);
    const x = create.parse(await req.json());
    const row = await db.$transaction(async tx => {
      const u = await tx.adminUser.create({data: {email: safeEmail(x.email), role: x.role, passwordHash: hashPassword(x.temporaryPassword)}});
      await tx.auditLog.create({data: {adminId: actor.id, action: "STAFF_CREATED", resourceType: "AdminUser", resourceId: u.id, afterState: {email: u.email, role: u.role, reason: x.reason}}});
      return u;
    }).catch(e => { if ((e as {code?: string}).code === "P2002") throw new HttpError(409, "STAFF_EXISTS", "A staff account with this email exists."); throw e; });
    return NextResponse.json({id: row.id, email: row.email, role: row.role}, {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
