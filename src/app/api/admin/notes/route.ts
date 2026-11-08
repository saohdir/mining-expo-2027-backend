import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";

const TYPES = ["CustomerAccount", "Enrollment", "BoothRequest", "Invoice"] as const;
const ROLES = ["SUPER_ADMIN", "SALES", "FINANCE", "OPERATIONS"] as const;
/** FR-148 internal notes: staff-only, append-only, never returned by customer or public APIs. */
export async function GET(req: NextRequest) {
  try {
    await admin([...ROLES]);
    const t = z.enum(TYPES).parse(req.nextUrl.searchParams.get("resourceType")), id = z.string().uuid().parse(req.nextUrl.searchParams.get("resourceId"));
    const notes = await db.internalNote.findMany({where: {resourceType: t, resourceId: id}, orderBy: {createdAt: "desc"}, take: 100});
    const authors = new Map((await db.adminUser.findMany({where: {id: {in: notes.map(n => n.adminId)}}, select: {id: true, email: true}})).map(a => [a.id, a.email]));
    return NextResponse.json({notes: notes.map(n => ({...n, author: authors.get(n.adminId) || "staff"}))}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
export async function POST(req: NextRequest) {
  try {
    const actor = await admin([...ROLES]);
    const x = z.object({resourceType: z.enum(TYPES), resourceId: z.string().uuid(), body: z.string().trim().min(2).max(2000)}).strict().parse(await req.json());
    const note = await db.internalNote.create({data: {...x, adminId: actor.id}});
    await db.auditLog.create({data: {adminId: actor.id, action: "INTERNAL_NOTE_ADDED", resourceType: x.resourceType, resourceId: x.resourceId, afterState: {noteId: note.id}}});
    return NextResponse.json({note}, {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
