import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {customer} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
/** FR-150: personal-data request intake (access, correction, deletion, consent withdrawal). Handled manually
 * by Super Admin under the approved retention policy (D-13); nothing is deleted automatically. */
export async function POST(req: NextRequest) {
  try {
    const acc = await customer();
    const x = z.object({kind: z.enum(["ACCESS", "CORRECTION", "DELETION", "CONSENT_WITHDRAWAL"]), details: z.string().trim().min(5).max(2000)}).strict().parse(await req.json());
    if (await db.dataRequest.count({where: {accountId: acc.id, status: {in: ["RECEIVED", "IN_PROGRESS"]}}}) >= 3) throw new HttpError(429, "TOO_MANY_REQUESTS", "You already have open requests.");
    const r = await db.$transaction(async tx => {
      const row = await tx.dataRequest.create({data: {accountId: acc.id, ...x}});
      await tx.notification.create({data: {audienceRole: "SUPER_ADMIN", type: "DATA_REQUEST_" + x.kind, recordType: "DataRequest", recordId: row.id}});
      await tx.auditLog.create({data: {accountId: acc.id, action: "DATA_REQUEST_SUBMITTED", resourceType: "DataRequest", resourceId: row.id, afterState: {kind: x.kind}}});
      return row;
    });
    return NextResponse.json({id: r.id, reference: "IMDX-DR-" + r.id.slice(0, 8).toUpperCase(), status: r.status}, {status: 201, headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
export async function GET() {
  try { const acc = await customer(); return NextResponse.json({requests: await db.dataRequest.findMany({where: {accountId: acc.id}, orderBy: {createdAt: "desc"}, select: {id: true, kind: true, status: true, createdAt: true, resolvedAt: true}})}, {headers: {"Cache-Control": "private,no-store"}}); }
  catch (e) { return failure(e); }
}
