import { isValidTimezone, modernTimezone } from "./timezones";

/**
 * Showing a moment in a chosen time zone, with nothing guessed: every answer comes from the engine's own time zone data (so
 * daylight saving is right for the date asked), and a zone name the engine does not know is never used. Pure; safe on the server.
 */

export type Zoned = { year: number; month: number; day: number; hour: number; minute: number };

const cache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = cache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
    cache.set(tz, f);
  }
  return f;
}

/** The wall clock in `tz` at this instant. `month` is 0 to 11, like Date. */
export function zonedParts(date: Date, tz: string): Zoned {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(date)) if (p.type !== "literal") out[p.type] = Number(p.value);
  return { year: out.year, month: out.month - 1, day: out.day, hour: out.hour === 24 ? 0 : out.hour, minute: out.minute };
}

/** A calendar day as "2026-10-2" (year, month 0 to 11, day), the key the calendar grid uses. */
export function dayKeyIn(date: Date, tz: string): string {
  const z = zonedParts(date, tz);
  return `${z.year}-${z.month}-${z.day}`;
}

/** How far `tz` is ahead of UTC at this instant, in milliseconds (whole minutes). */
function offsetMs(ms: number, tz: string): number {
  const z = zonedParts(new Date(ms), tz);
  return Date.UTC(z.year, z.month, z.day, z.hour, z.minute) - Math.floor(ms / 60_000) * 60_000;
}

/**
 * The instant at which the clock in `tz` reads this date and time. Used when a post is dragged to another day: it keeps its time
 * of day in the zone being shown. A time that does not exist (the hour skipped when clocks go forward) lands just after the gap.
 */
export function wallTimeToInstant(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const asUtc = Date.UTC(year, month, day, hour, minute);
  const first = asUtc - offsetMs(asUtc, tz);
  const second = asUtc - offsetMs(first, tz);
  const z = zonedParts(new Date(second), tz);
  if (z.year === year && z.month === month && z.day === day && z.hour === hour && z.minute === minute) return new Date(second);
  // The clock never read that time (the hour skipped when clocks go forward): take the later reading, just after the gap.
  return new Date(Math.max(first, second));
}

export function formatTimeIn(d: Date | string, tz: string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(date);
}

/** "Nov 2" for the day the moment falls on in `tz`. */
export function formatShortDateIn(d: Date | string, tz: string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz }).format(date);
}

/** The day a moment falls on in `tz`, as a plain local Date at midnight: what the calendar grid is built from. */
export function floatingDayIn(date: Date, tz: string): Date {
  const z = zonedParts(date, tz);
  return new Date(z.year, z.month, z.day);
}

/** "GMT+5:30", "GMT-8", "GMT" for the zone at this moment (daylight saving included). */
export function gmtLabel(tz: string, at: Date = new Date()): string {
  const minutes = Math.round(offsetMs(at.getTime(), tz) / 60_000);
  if (minutes === 0) return "GMT";
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `GMT${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** The place name people know: "Asia/Kolkata" is "Kolkata", "America/Argentina/Buenos_Aires" is "Buenos Aires". */
export function tzCity(tz: string): string {
  if (tz === "UTC") return "UTC";
  return (modernTimezone(tz).split("/").pop() ?? tz).replace(/_/g, " ");
}

/** The region part, "Asia" for "Asia/Kolkata" (empty for UTC). */
export function tzRegion(tz: string): string {
  const i = tz.indexOf("/");
  return i < 0 ? "" : tz.slice(0, i).replace(/_/g, " ");
}

/** The time zone this browser is in, under its modern name, or "UTC" when it cannot say. */
export function browserTimeZone(): string {
  try {
    const z = modernTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    return isValidTimezone(z) ? z : "UTC";
  } catch {
    return "UTC";
  }
}
