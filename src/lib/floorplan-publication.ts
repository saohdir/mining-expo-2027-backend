import type {Prisma} from "@prisma/client";
import {canPublishWithBlockers} from "./floorplan-safety";

type Reader = Pick<Prisma.TransactionClient, "boothRequest" | "boothHold" | "boothAssignment">;

/** Conservative publication barrier for the live floor a draft REPLACES (null = a new, additional floor:
 * nothing to reconcile). Unresolved commitments on the replaced floor require the approved remap. */
export async function floorplanBlockers(db: Reader, replacedFloorplanId: string | null) {
  if (!replacedFloorplanId) return {openRequests: 0, activeHolds: 0, activeAssignments: 0, canPublish: true};
  const [openRequests, activeHolds, activeAssignments] = await Promise.all([
    db.boothRequest.count({
      where: {floorplanId: replacedFloorplanId, status: {notIn: ["REJECTED", "CANCELLED"]}}
    }),
    db.boothHold.count({
      where: {status: "ACTIVE", boothUnit: {floorplanId: replacedFloorplanId}}
    }),
    db.boothAssignment.count({
      where: {active: true, boothUnit: {floorplanId: replacedFloorplanId}}
    })
  ]);
  return {
    openRequests,
    activeHolds,
    activeAssignments,
    canPublish: canPublishWithBlockers({openRequests, activeHolds, activeAssignments})
  };
}
