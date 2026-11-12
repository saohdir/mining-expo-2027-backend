import {db} from "@/lib/db";

/** Public floor plan display (owner setting, CMS › Floorplans):
 *  "names"  — booked booths show the company: the exhibitor's consented public name, or the company an admin entered;
 *  "status" — every booked or blocked booth shows only "Not available" (no company names, no reserved/occupied split). */
export const PUBLIC_DISPLAY_KEY = "floorplan.publicDisplay";
export type PublicDisplay = "names" | "status";
export async function publicDisplay(): Promise<PublicDisplay> {
  const s = await db.appSetting.findUnique({where: {key: PUBLIC_DISPLAY_KEY}});
  return s?.value === "status" ? "status" : "names";
}
