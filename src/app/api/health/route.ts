import {NextRequest, NextResponse} from "next/server";
import {db} from "@/lib/db";
import {HEARTBEAT_KEY, HEARTBEAT_STALE_MS} from "@/lib/ops-health";

/** Public health. `?deep=1` (for uptime monitors) also checks the database and the worker heartbeat and answers 503 when
 * either is down — it reveals only ok/down flags, no counts or internal details. */
export async function GET(req: NextRequest) {
  const base = {service: "imdx-platform", state: "development", payments: "MANUAL_TRANSFER_ONLY", registrationEnabled: process.env.ENABLE_REGISTRATION === "true", admissionEnabled: process.env.ENABLE_QR_ADMISSION === "true"};
  if (req.nextUrl.searchParams.get("deep") !== "1") return NextResponse.json(base, {headers: {"Cache-Control": "no-store"}});
  let database = false, worker = false;
  try {
    await db.$queryRaw`SELECT 1`; database = true;
    const hb = await db.appSetting.findUnique({where: {key: HEARTBEAT_KEY}});
    worker = !!hb && Date.now() - Date.parse(JSON.parse(hb.value).at) < HEARTBEAT_STALE_MS;
  } catch { /* reported as down */ }
  return NextResponse.json({...base, database: database ? "ok" : "down", worker: worker ? "ok" : "down"}, {status: database && worker ? 200 : 503, headers: {"Cache-Control": "no-store"}});
}
