import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimeZonePicker, filterZones, zoneRows } from "./time-zone-picker";

const NOW = new Date("2026-11-02T00:00:00Z");
const rows = zoneRows(NOW);

describe("zoneRows", () => {
  it("offers every zone the browser knows, once each, with a real offset", () => {
    const names = rows.map((r) => r.tz);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThan(100);
    expect(names).toContain("Asia/Kolkata");
    expect(names).toContain("America/New_York");
    expect(names).toContain("UTC");
    expect(rows.find((r) => r.tz === "Asia/Kolkata")).toMatchObject({ city: "Kolkata", region: "Asia", gmt: "GMT+5:30", minutes: 330 });
  });

  it("is ordered from the far west to the far east, like Buffer's list", () => {
    const m = rows.map((r) => r.minutes);
    expect([...m].sort((a, b) => a - b)).toEqual(m);
    expect(rows[0].minutes).toBeLessThanOrEqual(-600);
    expect(rows.at(-1)!.minutes).toBeGreaterThanOrEqual(720);
  });

  it("uses the offset of the moment asked, so daylight saving is right", () => {
    expect(zoneRows(new Date("2026-01-15T12:00:00Z")).find((r) => r.tz === "America/New_York")?.gmt).toBe("GMT-5");
    expect(zoneRows(new Date("2026-07-15T12:00:00Z")).find((r) => r.tz === "America/New_York")?.gmt).toBe("GMT-4");
  });
});

describe("filterZones", () => {
  const found = (q: string) => filterZones(rows, q).map((r) => r.tz);

  it("finds a city by part of its name, ignoring case and underscores", () => {
    expect(found("kolk")).toContain("Asia/Kolkata");
    expect(found("new york")).toContain("America/New_York");
    expect(found("NEW_YORK")).toContain("America/New_York");
  });

  it("finds a region and an offset", () => {
    expect(found("asia").length).toBeGreaterThan(20);
    expect(found("+5:30")).toContain("Asia/Kolkata");
    expect(found("gmt-8")).toContain("America/Los_Angeles".replace("Los_Angeles", "Los_Angeles")); // November: standard time
  });

  it("returns everything for an empty search and nothing for nonsense", () => {
    expect(filterZones(rows, "  ").length).toBe(rows.length);
    expect(found("zzzzqqq")).toEqual([]);
  });
});

describe("TimeZonePicker", () => {
  it("the button shows the current city, and the list is closed until it is opened", () => {
    const h = renderToStaticMarkup(createElement(TimeZonePicker, { value: "Asia/Kolkata", onChange: () => {}, deviceZone: "Asia/Kolkata" }));
    expect(h).toContain("Kolkata");
    expect(h).toContain('aria-expanded="false"');
    expect(h).toContain("Times are shown in Asia/Kolkata");
    expect(h).not.toContain("Search cities or timezones");
  });
});
