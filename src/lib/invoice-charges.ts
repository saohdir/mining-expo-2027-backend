import {z} from "zod";

/** FR-125: invoice fees/taxes "if configured". The organizer (D-01 Finance/Legal) defines charges; nothing is added
 * until a Super Admin saves an approved configuration. Charges are added as separate, labelled invoice lines
 * (kind TAX/FEE) computed on the item subtotal, so the ledger keeps one total and the PDF shows each line. */
export const CHARGES_KEY = "invoice.charges";
export const chargeSchema = z.object({
  code: z.string().regex(/^[A-Z0-9_]{2,20}$/), label: z.string().min(2).max(80), kind: z.enum(["TAX", "FEE"]),
  rateBps: z.number().int().min(0).max(10000).optional(), fixedMinor: z.string().regex(/^\d{1,15}$/).optional(),
  appliesTo: z.array(z.enum(["BOOTH", "CONFERENCE", "VISITOR"])).min(1)
}).strict().refine(c => (c.rateBps === undefined) !== (c.fixedMinor === undefined), "Give exactly one of rateBps or fixedMinor");
export const chargesConfigSchema = z.object({charges: z.array(chargeSchema).max(10), approvedBy: z.string().min(2).max(120), approvedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict();
export type ChargesConfig = z.infer<typeof chargesConfigSchema>;
export type BookingKind = "BOOTH" | "CONFERENCE" | "VISITOR";

/** Percentage charges round half-up to whole minor units; order = config order; all on the item subtotal (no compounding). */
export function computeCharges(cfg: ChargesConfig | null, subtotalMinor: bigint, kind: BookingKind) {
  if (!cfg) return [];
  return cfg.charges.filter(c => c.appliesTo.includes(kind)).map(c => {
    const amount = c.fixedMinor !== undefined ? BigInt(c.fixedMinor) : (subtotalMinor * BigInt(c.rateBps!) + 5000n) / 10000n;
    const label = c.rateBps !== undefined ? `${c.label} (${(c.rateBps / 100).toFixed(c.rateBps % 100 ? 2 : 0)}%)` : c.label;
    return {kind: c.kind, description: label.slice(0, 200), quantity: 1, unitPriceMinor: amount, amountMinor: amount};
  }).filter(l => l.amountMinor > 0n);
}
