import { describe, expect, it } from "vitest";
import { DATE_PRESETS, matchPreset, parseCustomRange, parseDay, presetRange, rangeLabel, todayDay } from "./date-range";

const NOW = new Date("2026-10-09T12:30:00Z");

describe("parseDay", () => {
  it("accepts real dates only", () => {
    expect(parseDay("2026-10-09")?.toISOString()).toBe("2026-10-09T00:00:00.000Z");
    for (const bad of ["2026-02-30", "2026-13-01", "26-10-09", "2026-10-9", "", null, undefined, "2026-10-09T00:00:00Z", "abc"]) expect(parseDay(bad as never)).toBeNull();
  });
});

describe("parseCustomRange", () => {
  it("is inclusive on both ends", () => {
    const r = parseCustomRange("2026-10-05", "2026-10-07", { now: NOW })!;
    expect(r.days).toBe(3);
    expect(r.from.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-07T23:59:59.999Z");
  });

  it("a single day is one day", () => {
    expect(parseCustomRange("2026-10-05", "2026-10-05", { now: NOW })!.days).toBe(1);
  });

  it("never ends in the future: today is clamped to now", () => {
    const r = parseCustomRange("2026-10-01", "2026-10-30", { now: NOW })!;
    expect(r.to.getTime()).toBe(NOW.getTime());
    expect(r.toDay).toBe("2026-10-30"); // what the user typed is kept for the form
  });

  it("rejects a start in the future, reversed dates, pre-2020 starts and unparseable input", () => {
    expect(parseCustomRange("2026-10-20", "2026-10-25", { now: NOW })).toBeNull();
    expect(parseCustomRange("2026-10-07", "2026-10-05", { now: NOW })).toBeNull();
    expect(parseCustomRange("2019-12-31", "2020-01-05", { now: NOW })).toBeNull();
    expect(parseCustomRange("x", "2026-10-05", { now: NOW })).toBeNull();
    expect(parseCustomRange(null, null, { now: NOW })).toBeNull();
  });

  it("caps the span", () => {
    expect(parseCustomRange("2021-01-01", "2026-10-09", { now: NOW, maxDays: 365 })).toBeNull();
    expect(parseCustomRange("2026-01-01", "2026-10-09", { now: NOW, maxDays: 365 })).not.toBeNull();
  });
});

describe("labels", () => {
  it("formats a range in UTC", () => {
    const r = parseCustomRange("2026-10-05", "2026-10-07", { now: NOW })!;
    expect(rangeLabel(r)).toBe("5 Oct 2026 – 7 Oct 2026");
  });
  it("todayDay is the UTC date", () => {
    expect(todayDay(NOW)).toBe("2026-10-09");
  });
});

describe("quick-pick presets", () => {
  it("covers today, yesterday and rolling windows as inclusive UTC days", () => {
    expect(presetRange("today", NOW)).toEqual({ from: "2026-10-09", to: "2026-10-09" });
    expect(presetRange("yesterday", NOW)).toEqual({ from: "2026-10-08", to: "2026-10-08" });
    expect(presetRange("7d", NOW)).toEqual({ from: "2026-10-03", to: "2026-10-09" });
    expect(presetRange("30d", NOW)).toEqual({ from: "2026-09-10", to: "2026-10-09" });
    expect(presetRange("90d", NOW)).toEqual({ from: "2026-07-12", to: "2026-10-09" });
  });

  it("handles month boundaries, including January looking back to December", () => {
    expect(presetRange("this-month", NOW)).toEqual({ from: "2026-10-01", to: "2026-10-09" });
    expect(presetRange("last-month", NOW)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    const jan = new Date("2026-01-15T00:00:00Z");
    expect(presetRange("last-month", jan)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetRange("this-year", NOW)).toEqual({ from: "2026-01-01", to: "2026-10-09" });
  });

  it("every preset parses as a valid custom range", () => {
    for (const p of DATE_PRESETS) {
      const r = presetRange(p.id, NOW)!;
      expect(parseCustomRange(r.from, r.to, { now: NOW }), p.id).not.toBeNull();
    }
  });

  it("unknown ids give nothing, and matchPreset finds the preset a range equals", () => {
    expect(presetRange("nope", NOW)).toBeNull();
    expect(matchPreset("2026-10-03", "2026-10-09", NOW)).toBe("7d");
    expect(matchPreset("2026-10-02", "2026-10-09", NOW)).toBe("");
    expect(matchPreset("", "", NOW)).toBe("");
  });
});
