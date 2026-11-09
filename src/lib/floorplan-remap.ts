import {Prisma} from "@prisma/client";
import {HttpError} from "./errors";
import {remapReport, type Commitment} from "./floorplan-geometry";

type Tx = Prisma.TransactionClient;
const OPEN = {notIn: ["REJECTED", "CANCELLED"] as ("REJECTED" | "CANCELLED")[]};
const ids = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Remap preview between the live floor a DRAFT replaces and that draft (FR-098, AT-081, P0-E).
 * Matching is by booth code. Nothing is changed here. */
export async function buildRemap(tx: Tx, draftId: string) {
  const draft = await tx.floorplan.findUnique({where: {id: draftId}, include: {units: true}});
  if (!draft) throw new HttpError(404, "NOT_FOUND", "Floorplan missing.");
  const published = draft.replacesId ? await tx.floorplan.findFirst({where: {id: draft.replacesId, status: "PUBLISHED"}, include: {units: true}}) : null;
  if (!published) return {draft, published: null, report: remapReport([], draft.units.map(u => ({code: u.code, areaSqm: Number(u.areaSqm)})), []), assignments: [], holds: [], requests: []};
  const unitById = new Map(published.units.map(u => [u.id, u]));
  const [assignments, holds, requests] = await Promise.all([
    tx.boothAssignment.findMany({where: {active: true, boothUnit: {floorplanId: published.id}}}),
    tx.boothHold.findMany({where: {status: "ACTIVE", boothUnit: {floorplanId: published.id}}}),
    tx.boothRequest.findMany({where: {floorplanId: published.id, status: OPEN}, include: {offers: {orderBy: {revision: "desc"}, take: 1}}})
  ]);
  const commitments: Commitment[] = [
    ...assignments.map(a => ({unitCode: unitById.get(a.boothUnitId)!.code, kind: "ASSIGNMENT" as const, requestId: a.boothRequestId})),
    ...holds.map(h => ({unitCode: unitById.get(h.boothUnitId)!.code, kind: "HOLD" as const, requestId: h.boothRequestId})),
    ...requests.flatMap(r => ids(r.preferredUnitIds).filter(i => unitById.has(i)).map(i => ({unitCode: unitById.get(i)!.code, kind: "PREFERENCE" as const, requestId: r.id}))),
    ...requests.flatMap(r => r.offers[0]?.acceptedAt ? ids(r.offers[0].offeredUnitIds).filter(i => unitById.has(i)).map(i => ({unitCode: unitById.get(i)!.code, kind: "OFFER" as const, requestId: r.id})) : [])
  ];
  const report = remapReport(published.units.map(u => ({code: u.code, areaSqm: Number(u.areaSqm)})), draft.units.map(u => ({code: u.code, areaSqm: Number(u.areaSqm)})), commitments);
  // Accepted quotations whose units vanish also block (customer accepted specific units).
  const blockingOffers = commitments.filter(c => c.kind === "OFFER" && report.rows.find(r => r.code === c.unitCode)?.status === "UNMATCHED").map(c => c.unitCode);
  return {draft, published, report: {...report, blocking: [...new Set([...report.blocking, ...blockingOffers])]}, assignments, holds, requests};
}

/** Apply an approved remap inside the publish transaction. Old records are ended, never deleted;
 * equivalent records are created on same-code units of the new version. */
export async function applyRemap(tx: Tx, r: Awaited<ReturnType<typeof buildRemap>>, actorId: string) {
  if (!r.published) return {moved: 0};
  const oldById = new Map(r.published.units.map(u => [u.id, u]));
  const newByCode = new Map(r.draft.units.map(u => [u.code.toUpperCase(), u]));
  const map = (oldId: string) => { const o = oldById.get(oldId); return o ? newByCode.get(o.code.toUpperCase()) : undefined; };
  const now = new Date(); let moved = 0;
  for (const a of r.assignments) {
    const n = map(a.boothUnitId); if (!n) throw new HttpError(409, "REMAP_UNMATCHED", "Assigned unit has no match in the new version.");
    await tx.boothAssignment.update({where: {id: a.id}, data: {active: false, endedAt: now}});
    await tx.boothAssignment.create({data: {boothUnitId: n.id, boothRequestId: a.boothRequestId, assignedBy: actorId, approvedForPublic: a.approvedForPublic}});
    await tx.boothUnit.update({where: {id: n.id}, data: {status: "OCCUPIED", approvedPublicName: oldById.get(a.boothUnitId)!.approvedPublicName}});
    moved++;
  }
  for (const h of r.holds) {
    const n = map(h.boothUnitId); if (!n) throw new HttpError(409, "REMAP_UNMATCHED", "Held unit has no match in the new version.");
    await tx.boothHold.update({where: {id: h.id}, data: {status: "RELEASED", endedAt: now, endedBy: actorId, endReason: "REMAPPED"}});
    await tx.boothHold.create({data: {boothUnitId: n.id, boothRequestId: h.boothRequestId, createdBy: actorId, expiresAt: h.expiresAt}});
    await tx.boothUnit.updateMany({where: {id: n.id, status: {not: "OCCUPIED"}}, data: {status: "RESERVED"}});
    moved++;
  }
  for (const req of r.requests) {
    const prefs = ids(req.preferredUnitIds).map(i => map(i)?.id).filter(Boolean) as string[];
    await tx.boothRequest.update({where: {id: req.id}, data: {floorplanId: r.draft.id, originalFloorplanId: req.originalFloorplanId ?? req.floorplanId, preferredUnitIds: prefs}});
    const offer = req.offers[0];
    if (offer?.acceptedAt) {
      const unitIds = ids(offer.offeredUnitIds).map(i => map(i)?.id);
      if (unitIds.some(x => !x)) throw new HttpError(409, "REMAP_UNMATCHED", "Accepted quotation unit has no match in the new version.");
      await tx.boothOffer.create({data: {boothRequestId: req.id, revision: offer.revision + 1, floorplanVersionNo: r.draft.versionNo, offeredUnitIds: unitIds as string[],
        offeredUnits: offer.offeredUnits as Prisma.InputJsonValue, offeredAreaSqm: offer.offeredAreaSqm, quotedPriceMinor: offer.quotedPriceMinor, currency: offer.currency,
        notes: "Remapped by code from floorplan v" + r.published.versionNo + " (approved remap).", acceptedAt: offer.acceptedAt, offeredBy: actorId}});
    }
    await tx.notification.create({data: {audienceRole: "SALES", type: "BOOTH_REQUEST_REMAPPED", recordType: "BoothRequest", recordId: req.id}});
  }
  return {moved, requests: r.requests.length};
}
