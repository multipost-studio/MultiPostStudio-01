import { describe, it, expect } from "vitest";
import { dayRange, safeZone, shiftYmd, timeLabel, ymdInZone, zonedDayStart } from "./time";

describe("zoned days", () => {
  it("knows which local day an instant belongs to", () => {
    const at = new Date("2026-10-06T20:30:00Z"); // 02:00 on the 7th in Kolkata, still the 6th in New York
    expect(ymdInZone(at, "Asia/Kolkata")).toBe("2026-10-07");
    expect(ymdInZone(at, "America/New_York")).toBe("2026-10-06");
    expect(ymdInZone(at, "UTC")).toBe("2026-10-06");
  });

  it("finds the start of a local day as a UTC instant", () => {
    expect(zonedDayStart("2026-10-07", "Asia/Kolkata").toISOString()).toBe("2026-10-06T18:30:00.000Z");
    expect(zonedDayStart("2026-10-06", "America/New_York").toISOString()).toBe("2026-10-06T04:00:00.000Z");
    expect(zonedDayStart("2026-10-06", "UTC").toISOString()).toBe("2026-10-06T00:00:00.000Z");
  });

  it("handles DST days that are 23 and 25 hours long", () => {
    const spring = dayRange(new Date("2026-03-08T12:00:00Z"), "America/New_York");
    expect((spring.end.getTime() - spring.start.getTime()) / 3_600_000).toBe(23);
    const fall = dayRange(new Date("2026-11-01T12:00:00Z"), "America/New_York");
    expect((fall.end.getTime() - fall.start.getTime()) / 3_600_000).toBe(25);
  });

  it("builds today and tomorrow ranges back to back", () => {
    const now = new Date("2026-10-06T10:00:00Z");
    const today = dayRange(now, "Asia/Kolkata");
    const tomorrow = dayRange(now, "Asia/Kolkata", 1);
    expect(today.end.getTime()).toBe(tomorrow.start.getTime());
    expect(today.start.getTime() <= now.getTime() && now.getTime() < today.end.getTime()).toBe(true);
  });

  it("shifts calendar dates across month and year ends", () => {
    expect(shiftYmd("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftYmd("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftYmd("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("falls back to UTC for unknown zones instead of throwing", () => {
    expect(safeZone("Mars/Olympus")).toBe("UTC");
    expect(safeZone(null)).toBe("UTC");
    expect(ymdInZone(new Date("2026-10-06T10:00:00Z"), "Not/AZone")).toBe("2026-10-06");
  });

  it("formats clock times in the user's zone", () => {
    expect(timeLabel(new Date("2026-10-06T04:00:00Z"), "Asia/Kolkata")).toBe("9:30 AM");
  });
});
