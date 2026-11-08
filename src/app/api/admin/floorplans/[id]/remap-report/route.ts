import {NextRequest, NextResponse} from "next/server";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";
import {buildRemap} from "@/lib/floorplan-remap";

/** FR-098 / AT-081 remap preview: matched/unmatched/new units by code with commitments. */
export async function GET(_req: NextRequest, {params}: {params: Promise<{id: string}>}) {
  try {
    await admin(["SUPER_ADMIN", "OPERATIONS", "SALES", "FINANCE"]);
    const {id} = await params; z.string().uuid().parse(id);
    const r = await buildRemap(db, id);
    return NextResponse.json({draftVersion: r.draft.versionNo, publishedVersion: r.published?.versionNo ?? null, ...r.report,
      canApply: r.report.blocking.length === 0, unplaced: r.draft.units.filter(u => !u.placed).map(u => u.code)}, {headers: {"Cache-Control": "private,no-store"}});
  } catch (e) { return failure(e); }
}
