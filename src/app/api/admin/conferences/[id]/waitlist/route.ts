import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";
/** FR-155 waitlist queue (first come, first served). */
export async function GET(_req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    await admin(["SUPER_ADMIN", "OPERATIONS", "SALES"]);
    const {id} = await params; z.string().uuid().parse(id);
    const entries = await db.waitlistEntry.findMany({where: {conferenceId: id}, orderBy: {createdAt: "asc"}});
    const accounts = new Map((await db.customerAccount.findMany({where: {id: {in: entries.map(e => e.accountId)}}, select: {id: true, email: true, profile: {select: {fullName: true, organization: true}}}})).map(a => [a.id, a]));
    return NextResponse.json({entries: entries.map(e => ({...e, customer: accounts.get(e.accountId)}))}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
