import {Prisma} from "@prisma/client";
import {hashToken, randomToken, sealToken} from "./security";
import {shortCodeFor, shortCodeHash} from "./pass-code";

type Tx = Prisma.TransactionClient;
/** FR-072/073: a confirmed conference enrollment gets a CONFERENCE pass, plus EXPO_ENTRY when the
 * account has no active expo pass for that event. Idempotent. */
export async function issueConferencePasses(tx: Tx, enrollmentId: string) {
  const e = await tx.enrollment.findUniqueOrThrow({where: {id: enrollmentId}, include: {event: true, conference: true, passes: {where: {status: "ACTIVE"}}}});
  if (e.type !== "CONFERENCE" || e.status !== "CONFIRMED") return 0;
  // FR-157: a programme with its own session zone gets a pass for exactly that zone (no access to other sessions).
  const wanted = [e.conference?.zoneCode || "CONFERENCE"];
  const expo = await tx.eventPass.count({where: {accountId: e.accountId, eventId: e.eventId, status: "ACTIVE", entitlement: "EXPO_ENTRY"}});
  if (!expo) wanted.push("EXPO_ENTRY");
  let issued = 0;
  for (const entitlement of wanted) {
    if (e.passes.some(p => p.entitlement === entitlement)) continue;
    const token = randomToken();
    await tx.eventPass.create({data: {accountId: e.accountId, enrollmentId: e.id, eventId: e.eventId, tokenHash: hashToken(token), shortCodeHash: shortCodeHash(shortCodeFor(token)),
      encryptedToken: sealToken(token), expiresAt: e.event.endsAt, entitlement}});
    issued++;
  }
  if (issued) await tx.notificationOutbox.create({data: {topic: "ENROLLMENT_REVIEWED", dedupeKey: "conference-pass:" + e.id + ":" + Date.now(), payload: {enrollmentId: e.id}}});
  return issued;
}
export async function revokeEnrollmentPasses(tx: Tx, enrollmentId: string, reason: string) {
  return (await tx.eventPass.updateMany({where: {enrollmentId, status: "ACTIVE"}, data: {status: "REVOKED", revokedAt: new Date(), revokeReason: reason}})).count;
}
