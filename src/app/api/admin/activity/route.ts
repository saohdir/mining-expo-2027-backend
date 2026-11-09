import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";

/** Recent staff activity for the Overview (read-only). Scoped by role to the record types that role already works with;
 * returns only the action, record type, short reference, time and the colleague's name — never before/after payloads,
 * customer-side events, sign-ins or list views. Super Admin keeps the full Audit Log page. */
const SCOPE: Record<string, string[]> = {
  SALES: ["BoothRequest", "BoothHold", "Enrollment", "Invoice", "Lead", "Group", "Invitation", "CustomerAccount"],
  FINANCE: ["Invoice", "ManualTransfer", "BoothRequest", "Enrollment", "ExportJob"],
  OPERATIONS: ["Enrollment", "BoothRequest", "BoothHold", "BoothUnit", "BoothCategory", "Floorplan", "Gate", "AdmissionPolicy", "EventPass", "Mailout", "Invitation", "Group", "CustomerAccount", "Lead"],
  CONTENT_EDITOR: ["PageLayout", "ContentItem", "ProgrammeItem", "GalleryItem", "GalleryYear", "MediaAsset", "Conference"],
  VIEWER: ["PageLayout", "ContentItem", "ProgrammeItem", "GalleryItem"]
};
const HIDDEN = /(LOGIN|LOGOUT|SIGNED_IN|SESSION|_VIEW$|_VIEWED$|LIST_VIEW|SEARCH)/;
const nice = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());

export async function GET() {
  try {
    const actor = await admin(["SUPER_ADMIN", "SALES", "FINANCE", "OPERATIONS", "CONTENT_EDITOR", "VIEWER"]);
    const types = actor.role === "SUPER_ADMIN" ? undefined : SCOPE[actor.role] || [];
    const rows = await db.auditLog.findMany({
      where: {adminId: {not: null}, ...(types ? {resourceType: {in: types}} : {})},
      orderBy: {createdAt: "desc"}, take: 60, select: {action: true, resourceType: true, resourceId: true, createdAt: true, adminId: true}
    });
    const visible = rows.filter(r => !HIDDEN.test(r.action)).slice(0, 12);
    const staff = await db.adminUser.findMany({where: {id: {in: [...new Set(visible.map(r => r.adminId!))]}}, select: {id: true, email: true}});
    const who = new Map(staff.map(s => [s.id, s.email.split("@")[0]]));
    return NextResponse.json({activity: visible.map(r => ({action: nice(r.action), type: r.resourceType.replace(/([a-z])([A-Z])/g, "$1 $2"),
      reference: r.resourceId.slice(0, 8), at: r.createdAt, by: who.get(r.adminId!) || "staff", self: r.adminId === actor.id}))}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
