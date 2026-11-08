/** Small pure release rules, independently unit-testable. All decisions are
 * rechecked inside SERIALIZABLE database transactions by the API routes.
 */
export function canPublishWithBlockers(counts: {
  openRequests: number; activeHolds: number; activeAssignments: number;
}): boolean {
  if (Object.values(counts).some(n => !Number.isSafeInteger(n) || n < 0))
    throw new Error("Invalid blocker count");
  return counts.openRequests === 0 && counts.activeHolds === 0 &&
    counts.activeAssignments === 0;
}

export function cloneBoothStatus(status: string): "AVAILABLE" | "BLOCKED" {
  // Copies are separate inventory IDs; historic holds/assignments are NEVER copied.
  return status === "AVAILABLE" ? "AVAILABLE" : "BLOCKED";
}

export function holdExpiryFromHours(now: Date, hours: number): Date {
  if (!Number.isSafeInteger(hours) || hours < 1 || hours > 168 ||
      Number.isNaN(now.getTime())) throw new Error("Hold duration must be 1–168 hours");
  return new Date(now.getTime() + hours * 3600000);
}

export function holdsMatchBooking(
  activeHolds: {boothUnitId: string; boothRequestId: string; expiresAt: Date}[],
  offeredIds: string[],
  bookingId: string,
  now: Date
): boolean {
  if (!activeHolds.length) return false; // Unheld allocation may still be authorized.
  return activeHolds.length === offeredIds.length &&
    new Set(activeHolds.map(h => h.boothUnitId)).size === offeredIds.length &&
    activeHolds.every(h => h.boothRequestId === bookingId &&
      offeredIds.includes(h.boothUnitId) && h.expiresAt > now);
}
