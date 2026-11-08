import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";

const schema = z.object({reason: z.string().min(8).max(300)}).strict();

/** Finance rejects a customer proof or a receipt awaiting approval. Record is kept (REJECTED). */
export async function POST(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    const actor = await admin(["FINANCE", "SUPER_ADMIN"]);
    const {id} = await params;
    z.string().uuid().parse(id);
    const x = schema.parse(await req.json());
    const out = await db.$transaction(async tx => {
      const t = await tx.manualTransfer.findUnique({where: {id}});
      if (!t || t.status !== "PENDING_VERIFICATION") throw new HttpError(409, "NOT_PENDING", "Only pending receipts or proofs can be rejected.");
      await tx.manualTransfer.update({where: {id}, data: {status: "REJECTED", decisionReason: x.reason, verifiedBy: actor.id, verifiedAt: new Date()}});
      await tx.auditLog.create({data: {adminId: actor.id, action: t.source === "CUSTOMER_PROOF" ? "PAYMENT_PROOF_REJECTED" : "BANK_TRANSFER_APPROVAL_REJECTED",
        resourceType: "ManualTransfer", resourceId: id, beforeState: {status: t.status}, afterState: {status: "REJECTED", reason: x.reason}}});
      if (t.source === "CUSTOMER_PROOF") await tx.notificationOutbox.create({data: {topic: "PAYMENT_PROOF_REJECTED", dedupeKey: "proof-rejected:" + id, payload: {invoiceId: t.invoiceId}}});
      return {transferId: id, status: "REJECTED"};
    });
    return NextResponse.json(out, {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
