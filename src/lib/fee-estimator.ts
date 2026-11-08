import {z} from "zod";

/** FR-159 (P2): transparent booth fee ESTIMATE from organizer-approved tariffs. It is informational only:
 * nothing is reserved, priced or committed — the binding price is always the organizer's versioned quotation. */
export const ESTIMATOR_KEY = "estimator.tariffs";
const minor = z.string().regex(/^\d{1,15}$/);
export const tariffSchema = z.object({
  currency: z.literal("IDR").default("IDR"),
  categories: z.array(z.object({name: z.string().min(1).max(60), perSqmMinor: minor, minimumSqm: z.number().min(0).max(10000).default(0)}).strict()).min(1).max(20),
  packages: z.array(z.object({name: z.string().min(1).max(80), maxSqm: z.number().positive().max(10000), priceMinor: minor, includes: z.string().max(400).default("")}).strict()).max(20).default([]),
  taxNote: z.string().max(300).default("Excludes tax unless stated in the official quotation."),
  approvedBy: z.string().min(2).max(120),
  approvedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
}).strict();
export type Tariffs = z.infer<typeof tariffSchema>;
export const DISCLAIMER = "Estimate only. Not a quotation, reservation or invoice. Final price and allocation are confirmed by the organizer in a written quotation.";

/** Area is rounded up to 0.5 m²; category minimum area applies; matching fixed package (smallest that fits) is offered as an alternative. */
export function estimate(t: Tariffs, areaSqm: number, categoryName: string) {
  const cat = t.categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
  if (!cat) return null;
  const area = Math.max(Math.ceil(areaSqm * 2) / 2, cat.minimumSqm);
  const perSqm = BigInt(cat.perSqmMinor);
  const totalMinor = (perSqm * BigInt(Math.round(area * 10))) / 10n;
  const pkg = t.packages.filter(p => p.maxSqm >= areaSqm).sort((a, b) => a.maxSqm - b.maxSqm)[0];
  return {currency: t.currency, category: cat.name, requestedSqm: areaSqm, pricedSqm: area, perSqmMinor: cat.perSqmMinor, estimateMinor: totalMinor.toString(),
    package: pkg ? {name: pkg.name, maxSqm: pkg.maxSqm, priceMinor: pkg.priceMinor, includes: pkg.includes} : null,
    minimumApplied: area > Math.ceil(areaSqm * 2) / 2, taxNote: t.taxNote, tariffApprovedAt: t.approvedAt, disclaimer: DISCLAIMER};
}
