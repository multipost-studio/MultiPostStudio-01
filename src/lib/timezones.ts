/**
 * IANA time zones for pickers and validation. The list comes from the runtime
 * (every zone the engine knows, so Asia/Kolkata is there), with a short fallback
 * for engines that cannot enumerate. Pure and safe on server and client.
 */

const FALLBACK = [
  "UTC", "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Denver", "America/Chicago",
  "America/New_York", "America/Sao_Paulo", "Atlantic/Reykjavik", "Europe/London", "Europe/Berlin", "Europe/Moscow",
  "Africa/Cairo", "Africa/Lagos", "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok",
  "Asia/Singapore", "Asia/Shanghai", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland",
];

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Engines enumerate the old canonical names ("Asia/Calcutta"), which people do not
 * recognise. Show the current names instead; both are valid IANA zones.
 */
const MODERN_NAME: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Rangoon": "Asia/Yangon",
  "Europe/Kiev": "Europe/Kyiv",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Pacific/Truk": "Pacific/Chuuk",
};

/** The current name of a zone the engine reports under an old one ("Asia/Calcutta" is "Asia/Kolkata"). Other names come back unchanged. */
export function modernTimezone(tz: string): string {
  const m = MODERN_NAME[tz];
  return m && isValidTimezone(m) ? m : tz;
}

export function allTimezones(): string[] {
  let list: string[] = FALLBACK;
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    const found = fn?.("timeZone");
    if (found && found.length > 0) list = found;
  } catch {
    /* keep the fallback */
  }
  const modern = list.map((tz) => (MODERN_NAME[tz] && isValidTimezone(MODERN_NAME[tz]) ? MODERN_NAME[tz] : tz));
  const unique = [...new Set(modern)];
  // "UTC" is not always in the enumerated list but is always valid.
  return unique.includes("UTC") ? unique : ["UTC", ...unique];
}

/**
 * A moment as it reads in another zone: "Tue 14 Oct, 14:30 (Asia/Kolkata)". `localInput` is the value of an
 * <input type="datetime-local"> (the browser's own wall-clock time). Returns null when there is nothing useful to
 * add: no zone set, an invalid zone, an unparsable time, or the zone is the one the browser is already in.
 */
export function describeInZone(localInput: string, tz: string | null | undefined, browserTz?: string): string | null {
  if (!tz || !isValidTimezone(tz)) return null;
  const d = new Date(localInput);
  if (Number.isNaN(d.getTime())) return null;
  let here = browserTz;
  if (!here) {
    try {
      here = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      here = undefined;
    }
  }
  const same = (a: string, b: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: a, timeZoneName: "longOffset", hour: "numeric", minute: "numeric", day: "numeric" }).format(d) ===
    new Intl.DateTimeFormat("en-US", { timeZone: b, timeZoneName: "longOffset", hour: "numeric", minute: "numeric", day: "numeric" }).format(d);
  if (here && isValidTimezone(here) && same(tz, here)) return null;
  const text = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return `${text.replace(",", "")} (${tz})`;
}

/** "UTC+05:30" for a zone right now (DST-aware). Empty string if the engine cannot say. */
export function offsetLabel(tz: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    if (!part) return "";
    const label = part.replace("GMT", "UTC");
    return label === "UTC+00:00" ? "UTC" : label;
  } catch {
    return "";
  }
}

/** Options for a <select>: "Asia/Kolkata (UTC+05:30)", sorted by offset then name. */
export function timezoneOptions(at: Date = new Date()): { value: string; label: string }[] {
  const rows = allTimezones().map((tz) => {
    const off = offsetLabel(tz, at);
    return { value: tz, label: off ? `${tz.replace(/_/g, " ")} (${off})` : tz.replace(/_/g, " "), off };
  });
  const minutes = (off: string) => {
    const m = off.match(/UTC([+-])(\d{2}):(\d{2})/);
    return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  };
  return rows.sort((a, b) => minutes(a.off) - minutes(b.off) || a.value.localeCompare(b.value)).map(({ value, label }) => ({ value, label }));
}
