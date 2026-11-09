import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";
import {opsStatus} from "@/lib/ops-health";

/** NFR-29: operational status for staff (worker heartbeat, outbox retries/dead letters, export failures, finance backlog). */
export async function GET() {
  try { await admin(["SUPER_ADMIN", "OPERATIONS"]); return NextResponse.json(await opsStatus(db), {headers: {"Cache-Control": "no-store"}}); }
  catch (e) { return failure(e); }
}
