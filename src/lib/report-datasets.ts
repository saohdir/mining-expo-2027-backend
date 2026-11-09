import {Prisma, type AdminRole} from "@prisma/client";
import {db} from "./db";
import {HttpError} from "./errors";
import {ledgerTotals} from "./finance-ledger";

/** Report datasets for exports (FR-031/067/121/122, AT-070/071/072). Columns are role-scoped:
 * contact PII only for roles that need it; finance amounts only for SUPER_ADMIN/FINANCE/SALES. */
export type Range = {from?: Date; to?: Date};
export type Dataset = {sheet: string; columns: string[]; rows: (string | number)[][]};
const inRange = (r: Range) => (r.from || r.to ? {...(r.from ? {gte: r.from} : {}), ...(r.to ? {lt: r.to} : {})} : undefined);
const iso = (d?: Date | null) => d ? d.toISOString() : "";
export const SYNC_LIMIT = 2000, ASYNC_LIMIT = 100000;
const guard = (n: number, limit: number) => { if (n > limit) throw new HttpError(413, "EXPORT_TOO_LARGE", `More than ${limit.toLocaleString("en")} records: use a background export or narrow the filters.`); };

export async function registrations(role: AdminRole, basis: string, r: Range, f: {type?: string; status?: string; q?: string}, limit = SYNC_LIMIT) {
  const range = inRange(r);
  const dateFilter: Prisma.EnrollmentWhereInput = !range ? {} : basis === "confirmed" ? {confirmedAt: range}
    : basis === "checkedIn" ? {passes: {some: {admissions: {some: {admittedAt: range}}}}} : {createdAt: range};
  const where: Prisma.EnrollmentWhereInput = {...dateFilter, ...(f.type ? {type: f.type as never} : {}), ...(f.status ? {status: f.status as never} : {}),
    ...(f.q ? {OR: [{id: {startsWith: f.q}}, {account: {email: {contains: f.q, mode: "insensitive"}}}, {account: {profile: {fullName: {contains: f.q, mode: "insensitive"}}}}]} : {})};
  guard(await db.enrollment.count({where}), limit);
  const contact = ["SUPER_ADMIN", "SALES", "FINANCE", "OPERATIONS"].includes(role);
  // NFR-26: read in keyset-paginated batches and keep only the flat row values (100k rows stay well under 1 GB RSS).
  const rows: Dataset["rows"] = [];
  let cursor: {id: string} | undefined;
  for (;;) {
    const rec = await db.enrollment.findMany({where, orderBy: [{createdAt: "desc"}, {id: "desc"}], take: 5000, ...(cursor ? {cursor, skip: 1} : {}),
      include: {account: {select: {email: true, profile: {select: {fullName: true, organization: true}}}}, conference: {select: {title: true}},
        passes: {select: {admissions: {select: {admittedAt: true}, orderBy: {admittedAt: "asc"}, take: 1}}}}});
    for (const x of rec) rows.push([x.id, x.type, x.status, x.account.profile?.fullName || "", ...(contact ? [x.account.email || ""] : []), x.account.profile?.organization || "", x.conference?.title || "",
      iso(x.createdAt), iso(x.confirmedAt), iso(x.passes.flatMap(p => p.admissions)[0]?.admittedAt)]);
    if (rec.length < 5000) break;
    cursor = {id: rec[rec.length - 1].id};
  }
  return {sheet: "Registrations", columns: ["Registration ID", "Type", "Status", "Customer", ...(contact ? ["Email"] : []), "Organization", "Conference", "Created UTC", "Confirmed UTC", "First check-in UTC"], rows} as Dataset;
}

export async function booths(role: AdminRole, basis: string, r: Range, f: {status?: string; hall?: string; zone?: string; q?: string}, limit = SYNC_LIMIT) {
  const range = inRange(r);
  const where: Prisma.BoothRequestWhereInput = {...(range ? (basis === "assigned" ? {assignments: {some: {assignedAt: range}}} : {createdAt: range}) : {}),
    ...(f.status ? {status: f.status as never} : {}), ...(f.q ? {OR: [{id: {startsWith: f.q}}, {account: {email: {contains: f.q, mode: "insensitive"}}}]} : {}),
    ...(f.hall || f.zone ? {assignments: {some: {active: true, boothUnit: {...(f.hall ? {hall: f.hall} : {}), ...(f.zone ? {zone: f.zone} : {})}}}} : {})};
  guard(await db.boothRequest.count({where}), limit);
  const rec = await db.boothRequest.findMany({where, orderBy: {createdAt: "desc"}, include: {account: {select: {email: true, profile: {select: {fullName: true}}}},
    assignments: {where: {active: true}, include: {boothUnit: {select: {code: true, hall: true, zone: true, areaSqm: true}}}},
    offers: {orderBy: {revision: "desc"}, take: 1}, invoices: {include: {transfers: true, adjustments: true}}}});
  const money = ["SUPER_ADMIN", "SALES", "FINANCE"].includes(role);
  return {sheet: "Booth requests", columns: ["Request ID", "Company", "Contact", ...(money ? ["Email"] : []), "Status", "Requested m²", "Offered m²", ...(money ? ["Quoted IDR", "Paid IDR", "Outstanding IDR"] : []),
    "Assigned units", "Hall", "Zone", "Assigned m²", "Created UTC"],
    rows: rec.map(x => {
      const inv = x.invoices.find(i => !["CANCELLED", "VOID", "DRAFT"].includes(i.status));
      const t = inv ? ledgerTotals(inv.totalMinor, inv.transfers, inv.adjustments) : null;
      const units = x.assignments.map(a => a.boothUnit);
      return [x.id, String((x.companySnapshot as {name?: string})?.name || ""), x.account.profile?.fullName || "", ...(money ? [x.account.email || ""] : []), x.status, Number(x.requestedAreaSqm),
        x.offers[0] ? Number(x.offers[0].offeredAreaSqm) : "", ...(money ? [x.offers[0]?.quotedPriceMinor.toString() || "", t?.paid.toString() || "0", t?.outstanding.toString() || ""] : []),
        units.map(u => u.code).join(" "), [...new Set(units.map(u => u.hall).filter(Boolean))].join(" "), [...new Set(units.map(u => u.zone).filter(Boolean))].join(" "),
        units.reduce((a, u) => a + Number(u.areaSqm), 0) || "", iso(x.createdAt)];
    })} as Dataset;
}

export async function finance(role: AdminRole, basis: string, r: Range, f: {status?: string; q?: string}, limit = SYNC_LIMIT) {
  if (!["SUPER_ADMIN", "FINANCE"].includes(role)) throw new HttpError(403, "FORBIDDEN", "Finance exports are restricted to Finance.");
  const range = inRange(r);
  const where: Prisma.InvoiceWhereInput = {status: f.status ? (f.status as never) : {not: "DRAFT"},
    ...(range ? (basis === "paid" ? {transfers: {some: {status: "VERIFIED", verifiedAt: range}}} : basis === "issued" ? {issuedAt: range} : {createdAt: range}) : {}),
    ...(f.q ? {OR: [{number: {contains: f.q, mode: "insensitive"}}, {account: {email: {contains: f.q, mode: "insensitive"}}}]} : {})};
  guard(await db.invoice.count({where}), limit);
  const rec = await db.invoice.findMany({where, orderBy: {createdAt: "desc"}, include: {account: {select: {email: true, profile: {select: {fullName: true, organization: true}}}}, transfers: true, adjustments: true}});
  return {sheet: "Finance", columns: ["Invoice", "Status", "Customer", "Organization", "Email", "Total IDR", "Verified receipts IDR", "Reversals IDR", "Refunds IDR", "Outstanding IDR", "Issued UTC", "Last verified UTC"],
    rows: rec.map(i => { const t = ledgerTotals(i.totalMinor, i.transfers, i.adjustments); const last = i.transfers.filter(x => x.verifiedAt && x.status === "VERIFIED").map(x => x.verifiedAt!).sort((a, b) => +b - +a)[0];
      return [i.number, i.status, i.account.profile?.fullName || "", i.account.profile?.organization || "", i.account.email || "", i.totalMinor.toString(), (t.paid + t.reversed).toString(), t.reversed.toString(), t.refunded.toString(),
        ["CANCELLED", "VOID"].includes(i.status) ? "0" : t.outstanding.toString(), iso(i.issuedAt), iso(last)]; })} as Dataset;
}
