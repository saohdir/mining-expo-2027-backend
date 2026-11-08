import type {Prisma} from "@prisma/client";

type Reader = Pick<Prisma.TransactionClient, "boothRequest" | "boothHold" | "boothAssignment">;

/** Conservative publication barrier.
 * This stage intentionally does NOT remap existing customers/paid invoices
 * to new booth IDs, therefore any unresolved request blocks publication.
 */
export async function floorplanBlockers(db: Reader, eventId: string) {
  const [openRequests, activeHolds, activeAssignments] = await Promise.all([
    db.boothRequest.count({
      where: {eventId, status: {notIn: ["REJECTED", "CANCELLED"]}}
    }),
    db.boothHold.count({
      where: {status: "ACTIVE", boothUnit: {floorplan: {eventId}}}
    }),
    db.boothAssignment.count({
      where: {active: true, boothUnit: {floorplan: {eventId}}}
    })
  ]);
  return {
    openRequests,
    activeHolds,
    activeAssignments,
    canPublish: openRequests === 0 && activeHolds === 0 && activeAssignments === 0
  };
}
