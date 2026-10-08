import type { DateRule } from "./types";

/**
 * Date arithmetic for festivals. Every date is a "YYYY-MM-DD" string, compared
 * lexicographically, and all day maths goes through UTC midnight so a viewer's
 * time zone or a DST change can never shift a date.
 */

export type YMD = string;

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (y: number, m: number, d: number): YMD => `${y}-${pad(m)}-${pad(d)}`;

export function toUtcMs(date: YMD): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromUtcMs(ms: number): YMD {
  const d = new Date(ms);
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export const addDays = (date: YMD, days: number): YMD => fromUtcMs(toUtcMs(date) + days * 86_400_000);
export const diffDays = (a: YMD, b: YMD): number => Math.round((toUtcMs(a) - toUtcMs(b)) / 86_400_000);

export function isYmd(value: unknown): value is YMD {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Today's date in an IANA zone. An unknown zone falls back to UTC rather than throwing. */
export function todayIn(timezone: string, nowMs: number): YMD {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(nowMs));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return fromUtcMs(nowMs);
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Gregorian Easter Sunday (anonymous Gregorian algorithm). */
export function easterSunday(year: number): YMD {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

export function nthWeekdayOf(year: number, month: number, weekday: number, nth: number): YMD {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
  return ymd(year, month, day);
}

const lunarCache = new Map<string, YMD[]>();

/**
 * Every Gregorian date in `year` that falls on month/day of a non-Gregorian
 * calendar. Scans the year once through Intl (cached): the Hijri and Chinese
 * calendars both ship with the JS engine, so these dates are computed, not typed in.
 */
function lunarOccurrences(calendar: "islamic-umalqura" | "chinese", month: number, day: number, year: number): YMD[] {
  const key = `${calendar}:${month}:${day}:${year}`;
  const hit = lunarCache.get(key);
  if (hit) return hit;
  const out: YMD[] = [];
  try {
    const fmt = new Intl.DateTimeFormat("en-u-ca-" + calendar, { timeZone: "UTC", month: "numeric", day: "numeric" });
    const start = Date.UTC(year, 0, 1);
    for (let i = 0; i < 366; i++) {
      const ms = start + i * 86_400_000;
      if (new Date(ms).getUTCFullYear() !== year) break;
      const parts = fmt.formatToParts(new Date(ms));
      const m = parts.find((p) => p.type === "month")?.value ?? "";
      const d = Number(parts.find((p) => p.type === "day")?.value);
      // Chinese leap months come back as e.g. "4bis"; only the regular month counts.
      if (/^\d+$/.test(m) && Number(m) === month && d === day) out.push(fromUtcMs(ms));
    }
  } catch {
    /* an engine without that calendar simply yields no dates */
  }
  lunarCache.set(key, out);
  return out;
}

function corrected(corrections: Record<number, string> | undefined, year: number): YMD[] | null {
  const md = corrections?.[year];
  return md && /^\d{2}-\d{2}$/.test(md) ? [`${year}-${md}`] : null;
}

/** All dates of a rule that fall inside a Gregorian year (usually one, sometimes two or none). */
export function occurrencesInYear(rule: DateRule, year: number): YMD[] {
  switch (rule.kind) {
    case "fixed":
      return [ymd(year, rule.month, rule.day)];
    case "nthWeekday":
      return [nthWeekdayOf(year, rule.month, rule.weekday, rule.nth)];
    case "easter":
      return [easterSunday(year)];
    case "islamic":
      return corrected(rule.corrections, year) ?? lunarOccurrences("islamic-umalqura", rule.month, rule.day, year);
    case "chinese":
      return corrected(rule.corrections, year) ?? lunarOccurrences("chinese", rule.month, rule.day, year);
    case "table": {
      const md = rule.dates[year];
      return md && /^\d{2}-\d{2}$/.test(md) ? [`${year}-${md}`] : [];
    }
  }
}

/** "8 Nov 2026": fixed locale and UTC, so server and browser always print the same text. */
export function formatYmd(date: YMD): string {
  return new Date(toUtcMs(date)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
