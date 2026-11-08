import {db} from "./db";
import {CHARGES_KEY, chargesConfigSchema, type ChargesConfig} from "./invoice-charges";
/** Approved invoice charges (FR-125) or null when none are configured. */
export async function loadCharges(): Promise<ChargesConfig | null> {
  const s = await db.appSetting.findUnique({where: {key: CHARGES_KEY}});
  return s ? chargesConfigSchema.parse(JSON.parse(s.value)) : null;
}
