import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {customer} from "@/lib/auth";
import {failure, HttpError} from "@/lib/errors";
import {policies} from "@/lib/policy";
import {assertSameOrigin} from "@/lib/customer-auth";
import {acceptInvitation, findByToken} from "@/lib/invitations";

const schema = z.object({token: z.string().min(20).max(100)}).strict();
/** FR-156/FR-059: the signed-in invitee accepts with their own account (email must match). */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const acc = await customer();
    const {token} = schema.parse(await req.json());
    const inv = await findByToken(token);
    if (inv.kind === "EXHIBITOR_STAFF" && !policies.exhibitorStaff()) throw new HttpError(503, "NOT_ENABLED", "Exhibitor staff passes are not enabled.");
    if (inv.kind === "GROUP_DELEGATE" && !(policies.groupEnrollment() && policies.registration())) throw new HttpError(503, "NOT_ENABLED", "Group registration is not enabled.");
    if (inv.kind === "PREREGISTERED_VISITOR" && !policies.bulkTools()) throw new HttpError(503, "NOT_ENABLED", "Pre-registration is not enabled.");
    return NextResponse.json(await acceptInvitation(token, acc), {headers: {"Cache-Control": "no-store"}});
  } catch (e) { return failure(e); }
}
