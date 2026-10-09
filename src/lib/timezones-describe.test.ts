import { describe, expect, it } from "vitest";
import { describeInZone } from "./timezones";

// A datetime-local value is read in the machine's own zone (the browser's, in the app), so the expected text is
// computed from the same instant instead of assuming where the tests run.
const WHEN = "2026-10-14T09:00";
const expected = (when: string, tz: string) => {
  const text = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(when));
  return `${text.replace(",", "")} (${tz})`;
};

describe("describeInZone", () => {
  it("shows the same moment in the workspace zone", () => {
    const out = describeInZone(WHEN, "Pacific/Auckland", "Not/Here");
    // an unknown browser zone is ignored, so the text is always produced
    expect(out).toBe(expected(WHEN, "Pacific/Auckland"));
    expect(out).toMatch(/^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} \d{2}:\d{2} \(Pacific\/Auckland\)$/);
  });

  it("converts rather than relabels", () => {
    const a = describeInZone(WHEN, "Asia/Tokyo", "Europe/London");
    const b = describeInZone(WHEN, "America/New_York", "Europe/London");
    expect(a).not.toBeNull();
    expect(a).not.toBe(b);
  });

  it("returns nothing when the workspace zone is the browser's own", () => {
    expect(describeInZone(WHEN, "Europe/London", "Europe/London")).toBeNull();
    expect(describeInZone(WHEN, "UTC", "UTC")).toBeNull();
  });

  it("treats two names for the same zone as the same", () => {
    expect(describeInZone(WHEN, "Asia/Kolkata", "Asia/Calcutta")).toBeNull();
  });

  it("returns nothing when there is nothing useful to say", () => {
    expect(describeInZone(WHEN, null, "UTC")).toBeNull();
    expect(describeInZone(WHEN, "", "UTC")).toBeNull();
    expect(describeInZone(WHEN, "Not/AZone", "UTC")).toBeNull();
    expect(describeInZone("not a date", "Asia/Kolkata", "UTC")).toBeNull();
  });
});
