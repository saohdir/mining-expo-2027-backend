import {HttpError} from "./errors";
const DAY = 86400000;
const wibMidnight = (d: Date) => new Date(Date.parse(d.toLocaleDateString("en-CA", {timeZone: "Asia/Jakarta"}) + "T00:00:00+07:00"));
/** FR-149 / NFR-25: KPI cards with period presets (today/7d/30d/month/custom, WIB) and an explicit
 * measure basis per metric; people are counted once per account (no multi-enrollment inflation). */
export function periodRange(period: string, from?: string | null, to?: string | null, now = new Date()) {
  const today = wibMidnight(now);
  switch (period) {
    case "today": return {from: today, to: new Date(+today + DAY)};
    case "7d": return {from: new Date(+today - 6 * DAY), to: new Date(+today + DAY)};
    case "30d": return {from: new Date(+today - 29 * DAY), to: new Date(+today + DAY)};
    case "month": { const ymd = today.toLocaleDateString("en-CA", {timeZone: "Asia/Jakarta"}); return {from: new Date(Date.parse(ymd.slice(0, 8) + "01T00:00:00+07:00")), to: new Date(+today + DAY)}; }
    case "custom": {
      if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new HttpError(400, "BAD_RANGE", "Custom period needs from/to YYYY-MM-DD (WIB).");
      const f = new Date(from + "T00:00:00+07:00"), t = new Date(Date.parse(to + "T00:00:00+07:00") + DAY);
      if (f >= t || +t - +f > 366 * DAY) throw new HttpError(400, "BAD_RANGE", "Invalid custom period (max 366 days).");
      return {from: f, to: t};
    }
    case "all": return {from: undefined, to: undefined};
    default: throw new HttpError(400, "BAD_PERIOD", "Period: today, 7d, 30d, month, custom, all.");
  }
}
