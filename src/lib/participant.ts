/** Participant details required before registering (visitor, conference) or requesting a booth (exhibitor PIC).
 * Email comes from the verified sign-up; the WhatsApp number must be verified by an OTP (SMS or WhatsApp). */
export const SALUTATIONS = ["BAPAK", "IBU"] as const;
export type Participant = {email: string | null; phone: string | null; verifiedPhoneAt: Date | null;
  profile: {salutation: string | null; fullName: string; jobTitle: string | null; organization: string | null} | null};

/** Indonesian-friendly E.164: "0812…" / "62812…" / "+62 812-…" → "+62812…"; other countries need a leading "+". */
export function normalizePhone(input: string) {
  const raw = input.replace(/[\s().-]/g, "");
  const e164 = raw.startsWith("+") ? raw : raw.startsWith("62") ? "+" + raw : raw.startsWith("0") ? "+62" + raw.slice(1) : raw;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

/** Missing items for visitor/conference registration (labels are shown to the customer). */
export function participantProblems(p: Participant, opts: {requireJob?: boolean} = {requireJob: true}) {
  const out: string[] = [];
  if (!p.profile?.salutation || !(SALUTATIONS as readonly string[]).includes(p.profile.salutation)) out.push("salutation");
  if (!p.profile?.fullName?.trim()) out.push("fullName");
  if (opts.requireJob !== false && !p.profile?.jobTitle?.trim()) out.push("jobTitle");
  if (opts.requireJob !== false && !p.profile?.organization?.trim()) out.push("organization");
  if (!p.email) out.push("email");
  if (!p.phone || !p.verifiedPhoneAt) out.push("whatsapp");
  return out;
}
export const participantSnapshot = (p: Participant) => ({salutation: p.profile?.salutation ?? null, fullName: p.profile?.fullName ?? "", jobTitle: p.profile?.jobTitle ?? null,
  organization: p.profile?.organization ?? null, email: p.email, whatsapp: p.phone});
