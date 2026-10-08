import { describe, it, expect } from "vitest";
import { addDays, diffDays, easterSunday, isYmd, nthWeekdayOf, occurrencesInYear, todayIn } from "./calendar";
import { FESTIVALS, FESTIVAL_BY_ID } from "./catalog";
import { DEFAULT_FESTIVAL_CONFIG, normalizeFestivalConfig, parseFestivalConfig } from "./config";
import { resolveFestivals, shiftYears } from "./resolve";
import type { FestivalConfig } from "./types";

const at = (iso: string) => Date.parse(iso);
const cfg = (patch: Partial<FestivalConfig> = {}): FestivalConfig => ({ ...DEFAULT_FESTIVAL_CONFIG, timezone: "UTC", autoMode: true, ...patch });

describe("calendar maths", () => {
  it("computes Easter and Thanksgiving exactly", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    expect(easterSunday(2028)).toBe("2028-04-16");
    expect(nthWeekdayOf(2026, 11, 4, 4)).toBe("2026-11-26");
    expect(nthWeekdayOf(2027, 11, 4, 4)).toBe("2027-11-25");
  });

  it("finds Lunar New Year and Eid through Intl", () => {
    const cny = FESTIVAL_BY_ID["lunar-new-year"].rule;
    // Published dates: Intl alone is a day off in 2027 and 2030, the catalog corrects those.
    const expected: Record<number, string> = { 2026: "02-17", 2027: "02-06", 2028: "01-26", 2029: "02-13", 2030: "02-03" };
    for (const [y, md] of Object.entries(expected)) expect(occurrencesInYear(cny, Number(y))).toEqual([`${y}-${md}`]);
    const fitr = occurrencesInYear({ kind: "islamic", month: 10, day: 1 }, 2026)[0];
    const adha = occurrencesInYear({ kind: "islamic", month: 12, day: 10 }, 2026)[0];
    // Moon sighting can differ from the tabular calendar by a day.
    expect(Math.abs(diffDays(fitr, "2026-03-20"))).toBeLessThanOrEqual(1);
    expect(Math.abs(diffDays(adha, "2026-05-27"))).toBeLessThanOrEqual(1);
  });

  it("does day maths through UTC, across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(diffDays("2027-01-01", "2026-12-25")).toBe(7);
    expect(shiftYears("2028-02-29", 1)).toBe("2029-02-28");
  });

  it("reads today in the configured zone", () => {
    // 20:00 UTC on Dec 31 is already Jan 1 in India.
    expect(todayIn("Asia/Kolkata", at("2026-12-31T20:00:00Z"))).toBe("2027-01-01");
    expect(todayIn("UTC", at("2026-12-31T20:00:00Z"))).toBe("2026-12-31");
    expect(todayIn("Not/AZone", at("2026-06-01T00:00:00Z"))).toBe("2026-06-01");
  });

  it("validates dates strictly", () => {
    expect(isYmd("2026-02-29")).toBe(false);
    expect(isYmd("2028-02-29")).toBe(true);
    expect(isYmd("2026-1-1")).toBe(false);
    expect(isYmd(20260101)).toBe(false);
  });
});

describe("catalog", () => {
  it("has unique ids, usable palettes and a date for every year the table claims", () => {
    expect(new Set(FESTIVALS.map((f) => f.id)).size).toBe(FESTIVALS.length);
    for (const f of FESTIVALS) {
      expect(f.colors.length).toBeGreaterThanOrEqual(3);
      expect(f.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c))).toBe(true);
      for (const y of [2026, 2027, 2028]) expect(occurrencesInYear(f.rule, y).length).toBeGreaterThan(0);
    }
  });
});

describe("resolving the live festival", () => {
  it("is silent unless auto mode is on or something is set manually", () => {
    expect(resolveFestivals(cfg({ autoMode: false }), at("2026-12-25T10:00:00Z")).active).toBeNull();
    expect(resolveFestivals(cfg(), at("2026-12-25T10:00:00Z")).active?.id).toBe("christmas");
  });

  it("opens and closes the window around the date", () => {
    const christmas = (iso: string) => resolveFestivals(cfg(), at(iso)).active?.id ?? null;
    expect(christmas("2026-12-12T12:00:00Z")).toBeNull();
    expect(christmas("2026-12-13T12:00:00Z")).toBe("christmas");
    expect(christmas("2026-12-26T12:00:00Z")).toBe("christmas");
    expect(christmas("2026-12-27T12:00:00Z")).toBeNull();
  });

  it("carries a window across the new year", () => {
    expect(resolveFestivals(cfg(), at("2026-12-30T12:00:00Z")).active?.id).toBe("new-year");
    expect(resolveFestivals(cfg(), at("2027-01-02T12:00:00Z")).active?.id).toBe("new-year");
    expect(resolveFestivals(cfg(), at("2027-01-03T12:00:00Z")).active).toBeNull();
  });

  it("uses the admin's time zone for 'today'", () => {
    const now = at("2026-12-12T20:00:00Z"); // Dec 13 in Kolkata, Dec 12 in UTC
    expect(resolveFestivals(cfg({ timezone: "Asia/Kolkata" }), now).active?.id).toBe("christmas");
    expect(resolveFestivals(cfg({ timezone: "UTC" }), now).active).toBeNull();
  });

  it("lets the higher priority win when windows overlap", () => {
    // Diwali (80) and Navratri/Dussehra (62) can both be open in some years; Diwali wins.
    const c = cfg({ overrides: { diwali: { dateOverride: "2026-10-22" } } });
    expect(resolveFestivals(c, at("2026-10-20T12:00:00Z")).active?.id).toBe("diwali");
  });

  it("skips a festival switched off for auto, and honours before/after overrides", () => {
    const off = cfg({ overrides: { christmas: { auto: false } } });
    expect(resolveFestivals(off, at("2026-12-25T12:00:00Z")).active).toBeNull();
    const wider = cfg({ overrides: { christmas: { before: 20 } } });
    expect(resolveFestivals(wider, at("2026-12-06T12:00:00Z")).active?.id).toBe("christmas");
  });

  it("replaces a computed date for that year with the admin's override", () => {
    const c = cfg({ overrides: { diwali: { dateOverride: "2026-11-10" } } });
    expect(resolveFestivals(c, at("2026-11-13T12:00:00Z")).active?.id).toBe("diwali");
    expect(resolveFestivals(c, at("2026-11-14T12:00:00Z")).active).toBeNull();
  });

  it("uses a custom message, falling back to the preset greeting", () => {
    const base = resolveFestivals(cfg(), at("2026-12-25T12:00:00Z")).active;
    expect(base?.message).toBe(FESTIVAL_BY_ID.christmas.greeting);
    const custom = resolveFestivals(cfg({ overrides: { christmas: { message: "  Season's greetings  " } } }), at("2026-12-25T12:00:00Z")).active;
    expect(custom?.message).toBe("Season's greetings");
  });

  it("lets a manual choice beat the calendar until its end date", () => {
    const c = cfg({ manual: { festivalId: "halloween", until: "2026-12-26" } });
    const live = resolveFestivals(c, at("2026-12-25T12:00:00Z")).active;
    expect(live?.id).toBe("halloween");
    expect(live?.source).toBe("manual");
    expect(resolveFestivals(c, at("2026-12-27T12:00:00Z")).active).toBeNull();
    const forever = cfg({ autoMode: false, manual: { festivalId: "holi", until: null } });
    expect(resolveFestivals(forever, at("2030-06-01T12:00:00Z")).active?.id).toBe("holi");
  });

  it("the master switch beats everything", () => {
    const c = cfg({ enabled: false, manual: { festivalId: "holi", until: null } });
    expect(resolveFestivals(c, at("2026-12-25T12:00:00Z")).active).toBeNull();
  });

  it("runs custom festivals, once or every year, and they beat presets", () => {
    const custom = { id: "custom-launch", name: "Launch week", themeId: "confetti-none", startsOn: "2026-12-24", endsOn: "2026-12-27", yearly: false } as const;
    // Unknown theme is ignored rather than crashing.
    expect(resolveFestivals(cfg({ custom: [custom as never] }), at("2026-12-25T12:00:00Z")).active?.id).toBe("christmas");
    const ok = { ...custom, themeId: "diwali" };
    const live = resolveFestivals(cfg({ custom: [ok] }), at("2026-12-25T12:00:00Z")).active;
    expect(live).toMatchObject({ id: "custom-launch", themeId: "diwali", source: "custom", name: "Launch week" });
    const yearly = cfg({ autoMode: false, custom: [{ ...ok, yearly: true }] });
    expect(resolveFestivals(yearly, at("2029-12-25T12:00:00Z")).active?.id).toBe("custom-launch");
    expect(resolveFestivals(cfg({ autoMode: false, custom: [ok] }), at("2027-12-25T12:00:00Z")).active).toBeNull();
  });

  it("lists what is coming up, soonest first", () => {
    const { upcoming } = resolveFestivals(cfg(), at("2026-06-01T12:00:00Z"));
    expect(upcoming.length).toBeGreaterThan(0);
    const starts = upcoming.map((u) => u.startsOn);
    expect([...starts].sort()).toEqual(starts);
    expect(upcoming.every((u) => u.endsOn >= "2026-06-01")).toBe(true);
  });
});

describe("config parsing", () => {
  it("fills a partial config from the defaults", () => {
    const res = parseFestivalConfig({ autoMode: true });
    expect(res.ok && res.config.autoMode).toBe(true);
    expect(res.ok && res.config.effects.particles).toBe(true);
  });

  it("reports bad input instead of dropping it", () => {
    const res = parseFestivalConfig({ timezone: "Mars/Base", custom: [{ id: "x", name: "", themeId: "nope", startsOn: "2026-02-30", endsOn: "x", yearly: 1 }] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.length).toBeGreaterThan(0);
  });

  it("rejects an end date before the start and duplicate ids", () => {
    const c = { id: "custom-aaa", name: "Sale", themeId: "diwali", startsOn: "2026-05-02", endsOn: "2026-05-01", yearly: false };
    expect(parseFestivalConfig({ custom: [c] }).ok).toBe(false);
    const good = { ...c, endsOn: "2026-05-03" };
    expect(parseFestivalConfig({ custom: [good, good] }).ok).toBe(false);
    expect(parseFestivalConfig({ custom: [good] }).ok).toBe(true);
  });

  it("falls back to the defaults for garbage, never throws", () => {
    for (const bad of [null, undefined, 5, "x", [], { enabled: "yes" }]) expect(normalizeFestivalConfig(bad)).toEqual(DEFAULT_FESTIVAL_CONFIG);
  });
});
