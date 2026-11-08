import {Prisma, type PrismaClient} from "@prisma/client";

/** Reconcile time-limited organizer holds. Run only on a backend worker, never
 * from an anonymous public request. Idempotent; a live assignment is never freed.
 */
export async function expireBoothHolds(db: PrismaClient, limit = 100): Promise<number> {
  const due = await db.boothHold.findMany({
    where: {status: "ACTIVE", expiresAt: {lte: new Date()}},
    select: {id: true}, take: limit, orderBy: {expiresAt: "asc"}
  });
  let expired = 0;
  for (const item of due) {
    try {
      const updated = await db.$transaction(async tx => {
        const hold = await tx.boothHold.findUnique({where: {id: item.id}});
        if (!hold || hold.status !== "ACTIVE" || hold.expiresAt > new Date()) return false;
        const now = new Date();
        const change = await tx.boothHold.updateMany({
          where: {id: hold.id, status: "ACTIVE", expiresAt: {lte: now}},
          data: {status: "EXPIRED", endedAt: now, endReason: "TTL_EXPIRED"}
        });
        if (change.count !== 1) return false;
        const live = await tx.boothHold.count({
          where: {boothUnitId: hold.boothUnitId, status: "ACTIVE"}
        });
        const assigned = await tx.boothAssignment.count({
          where: {boothUnitId: hold.boothUnitId, active: true}
        });
        if (!live && !assigned) {
          await tx.boothUnit.updateMany({
            where: {id: hold.boothUnitId, status: "RESERVED"},
            data: {status: "AVAILABLE"}
          });
        }
        await tx.auditLog.create({
          data: {action: "BOOTH_HOLD_EXPIRED", resourceType: "BoothHold",
            resourceId: hold.id, afterState: {boothUnitId: hold.boothUnitId,
              boothRequestId: hold.boothRequestId, endedAt: now.toISOString()}}
        });
        return true;
      }, {isolationLevel: Prisma.TransactionIsolationLevel.Serializable});
      if (updated) expired += 1;
    } catch (error) {
      // A competing allocation/release can cause P2034. It will be retried
      // on the next worker sweep; never clear RESERVED outside a transaction.
      if (typeof error === "object" && error && "code" in error &&
          (error as {code?: unknown}).code === "P2034") continue;
      throw error;
    }
  }
  return expired;
}
