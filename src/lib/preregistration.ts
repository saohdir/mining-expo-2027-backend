/** FR-154: CSV pre-registration import. Pure parsing/validation (unit-tested); the route does dedupe and invitations. */
export const PREREG_MAX_ROWS = 500;
export const PREREG_COLUMNS = ["email", "full_name", "organization", "job_title"] as const;
export type PreregRow = {line: number; email: string; fullName: string; organization: string; jobTitle: string};

/** RFC 4180-style parser: quoted fields, doubled quotes, commas/newlines inside quotes, CRLF, UTF-8 BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; continue; }
    if (c === '"' && cur === "") q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}

const EMAIL = /^[^\s@,;<>"]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/;
/** Strip control characters; a leading formula character is kept as text (never evaluated anywhere). */
const clean = (v: string | undefined, max: number) => (v || "").replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, max);

export function validatePrereg(text: string) {
  const errors: {line: number; message: string}[] = [];
  const rows = parseCsv(text);
  if (!rows.length) return {rows: [] as PreregRow[], errors: [{line: 1, message: "File is empty."}]};
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = Object.fromEntries(PREREG_COLUMNS.map(c => [c, header.indexOf(c)])) as Record<typeof PREREG_COLUMNS[number], number>;
  if (idx.email < 0 || idx.full_name < 0) return {rows: [], errors: [{line: 1, message: "Header must include email and full_name (optional: organization, job_title)."}]};
  if (rows.length - 1 > PREREG_MAX_ROWS) return {rows: [], errors: [{line: 1, message: "At most " + PREREG_MAX_ROWS + " rows per import."}]};
  const out: PreregRow[] = [], seen = new Set<string>();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2, email = clean(r[idx.email], 200).toLowerCase(), fullName = clean(r[idx.full_name], 120);
    if (!EMAIL.test(email)) return errors.push({line, message: "Invalid email."});
    if (fullName.length < 2) return errors.push({line, message: "Full name is required."});
    if (seen.has(email)) return errors.push({line, message: "Duplicate email in file."});
    seen.add(email);
    out.push({line, email, fullName, organization: idx.organization >= 0 ? clean(r[idx.organization], 160) : "", jobTitle: idx.job_title >= 0 ? clean(r[idx.job_title], 120) : ""});
  });
  return {rows: out, errors};
}
