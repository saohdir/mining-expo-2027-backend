import {NextRequest, NextResponse} from "next/server";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {failure, HttpError} from "@/lib/errors";
export const runtime = "nodejs";
export async function GET(_req: NextRequest, {params}: {params: Promise<{key: string}>}) {
  try {
    const {key} = await params;
    if (!/^[0-9a-f-]{36}\.webp$/.test(key)) throw new HttpError(404, "NOT_FOUND", "Not found.");
    const dir = process.env.MEDIA_UPLOAD_DIR || path.join(process.env.FLOORPLAN_UPLOAD_DIR || path.resolve(".data/floorplans"), "../media");
    const bytes = await readFile(path.join(dir, key)).catch(() => { throw new HttpError(404, "NOT_FOUND", "Not found."); });
    return new NextResponse(new Uint8Array(bytes), {headers: {"Content-Type": "image/webp", "Cache-Control": "public, max-age=86400, immutable", "X-Content-Type-Options": "nosniff"}});
  } catch (e) { return failure(e); }
}
