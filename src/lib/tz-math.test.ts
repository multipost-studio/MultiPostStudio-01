import { describe, it, expect } from "vitest";
import { browserTimeZone, dayKeyIn, floatingDayIn, formatShortDateIn, formatTimeIn, gmtLabel, tzCity, tzRegion, wallTimeToInstant, zonedParts } from "./tz-math";

const at = (iso: string) => new Date(iso);

describe("the same moment in different zones", () => {
  const m = at("2026-11-02T18:45:00Z");

  it("reads the wall clock of each zone, and which day it is there", () => {
    expect(zonedParts(m, "UTC")).toEqual({ year: 2026, month: 10, day: 2, hour: 18, minute: 45 });
    expect(zonedParts(m, "Asia/Kolkata")).toEqual({ year: 2026, month: 10, day: 3, hour: 0, minute: 15 }); // already the next day
    expect(zonedParts(m, "America/New_York")).toEqual({ year: 2026, month: 10, day: 2, hour: 13, minute: 45 });
    expect(zonedParts(m, "Pacific/Auckland")).toEqual({ year: 2026, month: 10, day: 3, hour: 7, minute: 45 });
  });

  it("names the day the way the calendar grid does (month 0 to 11)", () => {
    expect(dayKeyIn(m, "UTC")).toBe("2026-10-2");
    expect(dayKeyIn(m, "Asia/Kolkata")).toBe("2026-10-3");
  });

  it("formats the time and the short date in the chosen zone", () => {
    expect(formatTimeIn(m, "Asia/Kolkata")).toBe("12:15 AM");
    expect(formatTimeIn(m.toISOString(), "America/New_York")).toBe("1:45 PM");
    expect(formatShortDateIn(m, "Asia/Kolkata")).toBe("Nov 3");
    expect(formatShortDateIn(m, "America/Los_Angeles")).toBe("Nov 2");
  });

  it("builds the grid's plain date for the day it is in the zone", () => {
    const d = floatingDayIn(m, "Asia/Kolkata");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 3]);
  });

  it("midnight is 0, never 24", () => {
    expect(zonedParts(at("2026-11-02T18:30:00Z"), "Asia/Kolkata").hour).toBe(0);
  });
});

describe("wallTimeToInstant (dragging a post to another day keeps its time in the zone shown)", () => {
  it("is the inverse of reading the wall clock, for zones with and without daylight saving", () => {
    for (const tz of ["UTC", "Asia/Kolkata", "America/New_York", "Pacific/Auckland", "Asia/Kathmandu", "Australia/Lord_Howe"]) {
      const inst = wallTimeToInstant(2026, 6, 15, 9, 30, tz);
      expect(zonedParts(inst, tz)).toEqual({ year: 2026, month: 6, day: 15, hour: 9, minute: 30 });
    }
  });

  it("uses the offset of the date asked for: New York is UTC-5 in winter and UTC-4 in summer", () => {
    expect(wallTimeToInstant(2026, 0, 15, 9, 0, "America/New_York").toISOString()).toBe("2026-01-15T14:00:00.000Z");
    expect(wallTimeToInstant(2026, 6, 15, 9, 0, "America/New_York").toISOString()).toBe("2026-07-15T13:00:00.000Z");
  });

  it("Kolkata has no daylight saving: 9:30 is 04:00 UTC all year", () => {
    expect(wallTimeToInstant(2026, 0, 15, 9, 30, "Asia/Kolkata").toISOString()).toBe("2026-01-15T04:00:00.000Z");
    expect(wallTimeToInstant(2026, 6, 15, 9, 30, "Asia/Kolkata").toISOString()).toBe("2026-07-15T04:00:00.000Z");
  });

  it("across the day clocks change: the time of day is kept, the UTC instant moves", () => {
    // New York fell back on 1 Nov 2026
    const before = wallTimeToInstant(2026, 9, 31, 9, 0, "America/New_York");
    const after = wallTimeToInstant(2026, 10, 2, 9, 0, "America/New_York");
    expect(zonedParts(before, "America/New_York").hour).toBe(9);
    expect(zonedParts(after, "America/New_York").hour).toBe(9);
    expect(after.getTime() - before.getTime()).toBe(49 * 3600_000); // 48 hours plus the extra hour
  });

  it("a time that does not exist (clocks jump forward) lands after the gap, not on a wrong day", () => {
    const inst = wallTimeToInstant(2026, 2, 8, 2, 30, "America/New_York"); // 8 Mar 2026: 2:00 became 3:00
    const z = zonedParts(inst, "America/New_York");
    expect([z.year, z.month, z.day]).toEqual([2026, 2, 8]);
    expect(z.hour).toBeGreaterThanOrEqual(3);
  });
});

describe("gmtLabel (live offsets, daylight saving included)", () => {
  it("shows whole, half and quarter hour offsets like Buffer", () => {
    expect(gmtLabel("Asia/Kolkata", at("2026-11-02T00:00:00Z"))).toBe("GMT+5:30");
    expect(gmtLabel("Asia/Kathmandu", at("2026-11-02T00:00:00Z"))).toBe("GMT+5:45");
    expect(gmtLabel("Pacific/Honolulu", at("2026-11-02T00:00:00Z"))).toBe("GMT-10");
    expect(gmtLabel("UTC", at("2026-11-02T00:00:00Z"))).toBe("GMT");
  });

  it("follows daylight saving for the date asked", () => {
    expect(gmtLabel("America/New_York", at("2026-01-15T12:00:00Z"))).toBe("GMT-5");
    expect(gmtLabel("America/New_York", at("2026-07-15T12:00:00Z"))).toBe("GMT-4");
    expect(gmtLabel("Europe/London", at("2026-07-15T12:00:00Z"))).toBe("GMT+1");
  });
});

describe("names", () => {
  it("shows the place people know", () => {
    expect(tzCity("Asia/Kolkata")).toBe("Kolkata");
    expect(tzCity("Asia/Calcutta")).toBe("Kolkata");
    expect(tzCity("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(tzCity("America/New_York")).toBe("New York");
    expect(tzCity("UTC")).toBe("UTC");
    expect(tzRegion("Asia/Kolkata")).toBe("Asia");
    expect(tzRegion("UTC")).toBe("");
  });

  it("the browser's zone is always a real zone", () => {
    const z = browserTimeZone();
    expect(() => new Intl.DateTimeFormat("en-US", { timeZone: z })).not.toThrow();
  });
});
