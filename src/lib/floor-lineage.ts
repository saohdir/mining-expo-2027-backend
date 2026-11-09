import type {Prisma} from "@prisma/client";
import {HttpError} from "./errors";

type Tx = Pick<Prisma.TransactionClient, "floorplan">;

/** Which live floor a new draft replaces when published.
 * - newFloor: an additional floor, shown next to the others (replaces nothing).
 * - replacesId: a new version of that live floor.
 * - neither: the single live floor of the event (legacy behaviour); ambiguous with several live floors. */
export async function resolveReplaces(tx: Tx, eventId: string, x: {newFloor?: boolean; replacesId?: string | null}, sourceId?: string): Promise<string | null> {
  if (x.newFloor) return null;
  if (x.replacesId) {
    const p = await tx.floorplan.findFirst({where: {id: x.replacesId, eventId, status: "PUBLISHED"}, select: {id: true}});
    if (!p) throw new HttpError(400, "BAD_REPLACES", "Choose a live floor of this event to replace.");
    return p.id;
  }
  if (sourceId) {
    const src = await tx.floorplan.findUnique({where: {id: sourceId}, select: {status: true, id: true}});
    if (src?.status === "PUBLISHED") return src.id;
  }
  const live = await tx.floorplan.findMany({where: {eventId, status: "PUBLISHED"}, select: {id: true}});
  if (live.length > 1) throw new HttpError(400, "CHOOSE_FLOOR", "Several floors are live. Choose whether this is a new floor or a new version of one of them.");
  return live[0]?.id ?? null;
}
