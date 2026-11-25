/** Human-readable naming for QR passes shown to participants (My pass, print, download, documents).
 * The entitlement (EXPO_ENTRY, CONFERENCE or a session zone such as CONF_GREEN) stays the machine value checked at the gate;
 * participants see what the pass is for: the exhibition, or the full conference programme title with its date. */
export type PassKind = "EXHIBITION" | "CONFERENCE";
export type PassNaming = {kind: PassKind; label: string; startsAt: Date | null};

export function passNaming(entitlement: string, conference?: {title: string; startsAt: Date | null} | null): PassNaming {
  if (entitlement === "EXPO_ENTRY") return {kind: "EXHIBITION", label: "Exhibition entry", startsAt: null};
  return {kind: "CONFERENCE", label: conference?.title?.trim() || "Conference programme", startsAt: conference?.startsAt ?? null};
}

/** Exhibition entry first, then conference passes in programme order (date, then title). */
export function comparePasses(a: PassNaming, b: PassNaming) {
  if (a.kind !== b.kind) return a.kind === "EXHIBITION" ? -1 : 1;
  const t = (a.startsAt?.getTime() ?? Infinity) - (b.startsAt?.getTime() ?? Infinity);
  return t || a.label.localeCompare(b.label);
}

/** File name for "Download QR": readable and safe on every OS, e.g. imdx-pass-indonesia-mining-industry-networking-reception.png */
export function passFileName(label: string) {
  const slug = label.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
  return "imdx-pass-" + (slug || "qr") + ".png";
}
