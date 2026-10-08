import { describe, it, expect } from "vitest";
import { allTimezones, isValidTimezone, offsetLabel, timezoneOptions } from "./timezones";

describe("timezones", () => {
  it("knows India, and always UTC", () => {
    const all = allTimezones();
    expect(all).toContain("UTC");
    expect(all).toContain("Asia/Kolkata");
    expect(all.length).toBeGreaterThan(20);
  });

  it("validates strictly", () => {
    expect(isValidTimezone("Asia/Kolkata")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Mars/Base")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone("x".repeat(80))).toBe(false);
    expect(isValidTimezone(42)).toBe(false);
  });

  it("labels the offset, including half-hour zones and UTC itself", () => {
    const at = new Date("2026-06-01T12:00:00Z");
    expect(offsetLabel("Asia/Kolkata", at)).toBe("UTC+05:30");
    expect(offsetLabel("UTC", at)).toBe("UTC");
    expect(offsetLabel("America/New_York", at)).toBe("UTC-04:00");
    expect(offsetLabel("America/New_York", new Date("2026-01-15T12:00:00Z"))).toBe("UTC-05:00");
  });

  it("builds sorted picker options with offsets", () => {
    const opts = timezoneOptions(new Date("2026-06-01T12:00:00Z"));
    const kolkata = opts.find((o) => o.value === "Asia/Kolkata");
    expect(kolkata?.label).toBe("Asia/Kolkata (UTC+05:30)");
    const idx = (v: string) => opts.findIndex((o) => o.value === v);
    expect(idx("America/Los_Angeles")).toBeLessThan(idx("Europe/London"));
    expect(idx("Europe/London")).toBeLessThan(idx("Asia/Kolkata"));
    expect(idx("Asia/Kolkata")).toBeLessThan(idx("Asia/Tokyo"));
  });
});
