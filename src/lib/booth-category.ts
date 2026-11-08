import {z} from "zod";
/** FR-092: name, HEX colour, pattern (for non-colour status distinction) and order. */
export const categoryInput = z.object({name: z.string().trim().min(2).max(60), colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  pattern: z.enum(["SOLID", "HATCH", "DOTS", "CROSS"]).default("SOLID"), sortOrder: z.number().int().min(0).max(999).default(0)}).strict();
