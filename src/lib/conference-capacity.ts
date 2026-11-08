import type {EnrollmentStatus} from "@prisma/client";

/** Only submitted, review-pending, and confirmed bookings consume a seat.
 * Cancelled/rejected bookings free capacity; drafts do not consume capacity.
 */
export const ACTIVE_CONFERENCE_STATUSES: EnrollmentStatus[] = [
  "SUBMITTED",
  "PENDING_REVIEW",
  "CONFIRMED"
];

export type ConferenceRegistrationState = "AVAILABLE" | "FULL" | "NOT_READY";

/** Informational projection. Write-time capacity must be rechecked in a
 * SERIALIZABLE transaction; this result is never a reservation.
 */
export function conferenceAvailability(
  capacity: number | null,
  activeEnrollmentCount: number,
  feeMinor: bigint | null
): {registrationState: ConferenceRegistrationState; remainingSeats: number | null} {
  if (!Number.isSafeInteger(activeEnrollmentCount) || activeEnrollmentCount < 0) {
    throw new Error("Invalid enrollment count");
  }
  if (capacity !== null && (!Number.isSafeInteger(capacity) || capacity <= 0)) {
    throw new Error("Invalid conference capacity");
  }

  const remainingSeats = capacity === null ? null : Math.max(0, capacity - activeEnrollmentCount);
  // A published programme can be informational even while fee or capacity is TBA.
  if (capacity === null || feeMinor === null) {
    return {registrationState: "NOT_READY", remainingSeats};
  }
  return {registrationState: remainingSeats === 0 ? "FULL" : "AVAILABLE", remainingSeats};
}
