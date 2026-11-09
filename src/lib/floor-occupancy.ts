import {db} from "./db";

const OPEN = ["NEW", "UNDER_REVIEW", "OFFERED", "ACCEPTED", "WAITING_INVOICE", "INVOICED", "ALLOCATION_PENDING", "CONFIRMED"] as const;
const ids = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
type Snap = {name?: string; contactName?: string; email?: string; picWhatsapp?: string};

export type Occupant = {source: "BOOKING" | "HOLD" | "MANUAL"; company: string; contact: string; requestId: string | null; requestStatus: string | null};
export type UnitOccupancy = {unitId: string; code: string; hall: string | null; areaSqm: number; status: string; splitFromId: string | null;
  occupant: Occupant | null; interested: {company: string; requestId: string; status: string}[]};

/** Who booked which booth on one floor: confirmed bookings (assignment), reserved bookings (hold),
 * manual entries made by the organizer, and companies that asked for the booth (preference / quotation). */
export async function floorOccupancy(floorplanId: string): Promise<UnitOccupancy[]> {
  const units = await db.boothUnit.findMany({where: {floorplanId, placed: true}, orderBy: {code: "asc"},
    include: {assignments: {where: {active: true}, select: {boothRequestId: true}}, holds: {where: {status: "ACTIVE"}, select: {boothRequestId: true}}}});
  const committedIds = [...new Set(units.flatMap(u => [...u.assignments, ...u.holds].map(x => x.boothRequestId)))];
  const reqs = await db.boothRequest.findMany({where: {OR: [{floorplanId, status: {in: [...OPEN]}}, {id: {in: committedIds}}]},
    select: {id: true, status: true, preferredUnitIds: true, companySnapshot: true, account: {select: {email: true, profile: {select: {organization: true, fullName: true}}}},
      offers: {orderBy: {revision: "desc"}, take: 1, select: {offeredUnitIds: true}}}});
  const byId = new Map(reqs.map(r => [r.id, r]));
  const who = (r: (typeof reqs)[number]) => { const s = (r.companySnapshot || {}) as Snap;
    return {company: s.name || r.account.profile?.organization || r.account.email || "—", contact: [s.contactName || r.account.profile?.fullName, s.email || r.account.email, s.picWhatsapp].filter(Boolean).join(" · ")}; };
  return units.map(u => {
    const a = u.assignments[0] && byId.get(u.assignments[0].boothRequestId), h = u.holds[0] && byId.get(u.holds[0].boothRequestId);
    const occupant: Occupant | null = a ? {source: "BOOKING", ...who(a), requestId: a.id, requestStatus: a.status}
      : h ? {source: "HOLD", ...who(h), requestId: h.id, requestStatus: h.status}
      : u.occupantCompany ? {source: "MANUAL", company: u.occupantCompany, contact: u.occupantContact || "", requestId: null, requestStatus: null} : null;
    const interested = reqs.filter(r => r.id !== occupant?.requestId && (OPEN as readonly string[]).includes(r.status) && r.status !== "CONFIRMED" &&
      (ids(r.preferredUnitIds).includes(u.id) || ids(r.offers[0]?.offeredUnitIds).includes(u.id))).map(r => ({company: who(r).company, requestId: r.id, status: r.status}));
    return {unitId: u.id, code: u.code, hall: u.hall, areaSqm: Number(u.areaSqm), status: u.status, splitFromId: u.splitFromId, occupant, interested};
  });
}

/** Units that the portal itself tracks (bookings / holds / customer interest) cannot be overwritten by a manual entry or merged away. */
export async function unitCommitments(unitId: string, floorplanId: string) {
  const [holds, assignments, open] = await Promise.all([
    db.boothHold.count({where: {boothUnitId: unitId, status: "ACTIVE"}}),
    db.boothAssignment.count({where: {boothUnitId: unitId, active: true}}),
    db.boothRequest.findMany({where: {floorplanId, status: {in: [...OPEN]}}, select: {preferredUnitIds: true, offers: {select: {offeredUnitIds: true}}}})]);
  const referenced = open.some(r => ids(r.preferredUnitIds).includes(unitId) || r.offers.some(o => ids(o.offeredUnitIds).includes(unitId)));
  return {holds, assignments, referenced};
}
