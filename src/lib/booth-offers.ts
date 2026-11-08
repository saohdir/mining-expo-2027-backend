import {HttpError} from "./errors";

/** Customer preferences and organizer offers never reserve inventory. */
export function uniqueOfferedIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6 ||
      !value.every(item => typeof item === "string" && /^[0-9a-f-]{36}$/i.test(item)) ||
      new Set(value).size !== value.length) {
    throw new HttpError(409, "INVALID_OFFER", "Offer units are invalid. Please contact Operations.");
  }
  return value as string[];
}

export function sameBoothUnits(first: string[], second: string[]): boolean {
  return first.length === second.length &&
    first.every(id => second.includes(id));
}

export function quoteMinor(value: string): bigint {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new HttpError(400, "INVALID_QUOTE", "Approved quotation must be a positive IDR amount.");
  }
  const amount = BigInt(value);
  if (amount > 10000000000000n) {
    throw new HttpError(400, "QUOTE_TOO_LARGE", "Quotation exceeds the UAT safety threshold.");
  }
  return amount;
}
