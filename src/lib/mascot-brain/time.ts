/**
 * Calendar-day maths in an IANA time zone. "Today" for a user in Kolkata is not
 * "today" on the server, and getting it wrong silently shows yesterday's queue.
 * Pure; takes the clock as an argument.
 */

/** Falls back to UTC for an unknown zone name rather than throwing. */
export function safeZone(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

function offsetMs(at: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** The local calendar date (YYYY-MM-DD) of an instant in `tz`. */
export function ymdInZone(at: Date, tz: string): string {
  const zone = safeZone(tz);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The instant a local calendar day begins in `tz` (handles DST days of 23/25 hours). */
export function zonedDayStart(ymd: string, tz: string): Date {
  const zone = safeZone(tz);
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(new Date(guess), zone);
  t = guess - offsetMs(new Date(t), zone);
  return new Date(t);
}

/** [start, end) of the local day that is `offsetDays` after the day containing `now`. */
export function dayRange(now: Date, tz: string, offsetDays = 0): { start: Date; end: Date } {
  const base = shiftYmd(ymdInZone(now, tz), offsetDays);
  return { start: zonedDayStart(base, tz), end: zonedDayStart(shiftYmd(base, 1), tz) };
}

/** "9:30 AM" in the user's zone. */
export function timeLabel(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: safeZone(tz), hour: "numeric", minute: "2-digit" }).format(at);
}

/** "Tue, Oct 6" in the user's zone. */
export function dayLabel(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: safeZone(tz), weekday: "short", month: "short", day: "numeric" }).format(at);
}
