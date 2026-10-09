import { describe, expect, it } from "vitest";
import { resolveAnalyticsRange } from "./analytics-range";

const NOW = new Date("2026-10-09T12:00:00Z");

describe("resolveAnalyticsRange", () => {
  it("keeps the presets exactly as before", () => {
    expect(resolveAnalyticsRange({ range: "7" }, NOW)).toMatchObject({ days: 7, window: null, custom: null, invalid: false, label: "last 7 days", query: "range=7" });
    expect(resolveAnalyticsRange({}, NOW)).toMatchObject({ days: 30, query: "range=30" });
  });

  it("falls back to 30 days for anything else", () => {
    for (const range of ["5", "abc", "-1", "9999", "custom-ish"]) expect(resolveAnalyticsRange({ range }, NOW)).toMatchObject({ days: 30, window: null, invalid: false });
  });

  it("resolves a custom window and reproduces it in the query string", () => {
    const r = resolveAnalyticsRange({ range: "custom", from: "2026-09-01", to: "2026-09-30" }, NOW);
    expect(r.window).toEqual({ from: new Date("2026-09-01T00:00:00Z"), to: new Date("2026-09-30T23:59:59.999Z") });
    expect(r.custom).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(r.query).toBe("range=custom&from=2026-09-01&to=2026-09-30");
    expect(r.label).toMatch(/^1 Sep\w* 2026 – 30 Sep\w* 2026$/);
  });

  it("flags unusable custom dates and falls back to 30 days", () => {
    for (const sp of [{ range: "custom" }, { range: "custom", from: "2026-10-05", to: "2026-10-01" }, { range: "custom", from: "nope", to: "2026-10-01" }, { range: "custom", from: "2024-01-01", to: "2026-10-01" }]) {
      expect(resolveAnalyticsRange(sp, NOW)).toMatchObject({ days: 30, window: null, custom: null, invalid: true });
    }
  });
});
