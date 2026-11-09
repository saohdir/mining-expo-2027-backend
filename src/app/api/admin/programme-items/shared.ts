import type {Prisma} from "@prisma/client";
import {HttpError} from "@/lib/errors";
import {CONFIRM_ROLES, type ItemInput} from "@/lib/programme";

/** Fields only the organizer side may set (facts shown publicly as official, or a link to a bookable conference). */
export function assertConfirmRights(role: string, next: ItemInput, before?: {dateConfirmed: boolean; venueConfirmed: boolean; feeConfirmed: boolean; conferenceId: string | null}) {
  if ((CONFIRM_ROLES as readonly string[]).includes(role)) return;
  const changed = (k: "dateConfirmed" | "venueConfirmed" | "feeConfirmed") => next[k] !== (before ? before[k] : false);
  if (changed("dateConfirmed") || changed("venueConfirmed") || changed("feeConfirmed") || (next.conferenceId ?? null) !== (before?.conferenceId ?? null))
    throw new HttpError(403, "CONFIRM_ROLE_REQUIRED", "Only Super Admin or Operations can confirm date, venue or fee, or link a bookable conference.");
}
export function itemData(x: ItemInput) {
  const {translations: _t, eventDate, ...rest} = x;
  return {...rest, eventDate: eventDate ? new Date(eventDate + "T00:00:00Z") : null, sourceSystem: x.sourceSystem || null, sourceId: x.sourceId || null};
}
export function translationRows(x: ItemInput) {
  return (["en", "zh"] as const).flatMap(locale => { const t = x.translations[locale]; return t ? [{locale, ...t, highlights: t.highlights as Prisma.InputJsonValue}] : []; });
}
export const uniqueError = (e: unknown) => {
  const c = e as {code?: string; meta?: {target?: string[] | string}};
  if (c.code === "P2002") throw new HttpError(409, "DUPLICATE", String(c.meta?.target).includes("slug") ? "This slug is already used by another programme." : "This source (system + ID) was already imported.");
  throw e;
};
