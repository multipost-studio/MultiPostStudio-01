import { describe, it, expect } from "vitest";
import { POSTING_RESEARCH, describeResearch, describeSlot, researchFor, suggestSlots } from "./posting-times";

describe("the research behind the suggestions", () => {
  it("names its source, its date and what it measured", () => {
    expect(POSTING_RESEARCH.source).toBe("Sprout Social");
    expect(POSTING_RESEARCH.updated).toBe("March 2026");
    expect(POSTING_RESEARCH.url).toMatch(/^https:\/\/sproutsocial\.com\//);
    expect(POSTING_RESEARCH.basis).toMatch(/2 billion engagements/);
  });

  it("has per-network windows for the six networks the study covers", () => {
    for (const p of ["facebook", "instagram", "tiktok", "x", "linkedin", "pinterest"]) expect(researchFor(p).specific, p).toBe(true);
  });

  it("other networks use the study's overall result and say so, never an invented table", () => {
    for (const p of ["youtube", "threads", "bluesky", "gbp"]) {
      const r = researchFor(p);
      expect(r.specific, p).toBe(false);
      expect(Object.keys(r.week).sort()).toEqual(["2", "3"]); // Tuesdays and Wednesdays
    }
  });

  it("windows are transcribed as published (Instagram)", () => {
    expect(describeResearch("instagram")).toEqual([
      "Mondays 2 p.m. to 4 p.m.",
      "Tuesdays 1 p.m. to 7 p.m.",
      "Wednesdays 12 p.m. to 9 p.m. and 11 p.m. to 12 a.m.",
      "Thursdays 12 p.m. to 2 p.m.",
    ]);
    expect(describeResearch("linkedin")[1]).toBe("Tuesdays 11 a.m. to 5 p.m.");
  });
});

describe("suggestSlots", () => {
  it("never suggests a time outside a published window, on any network", () => {
    for (const p of ["facebook", "instagram", "tiktok", "x", "linkedin", "pinterest", "youtube"]) {
      const week = researchFor(p).week;
      for (const n of [1, 3, 5]) {
        for (const s of suggestSlots(p, n)) {
          const inside = (week[s.weekday] ?? []).some((w) => s.hour >= w.from && s.hour < w.to);
          expect(inside, `${p} ${describeSlot(s)}`).toBe(true);
          expect(s.minute).toBe(0);
        }
      }
    }
  });

  it("starts with the strongest day: one a week is the widest window", () => {
    expect(suggestSlots("instagram", 1)).toEqual([{ weekday: 3, hour: 16, minute: 0 }]); // Wednesday, middle of 12 p.m. to 9 p.m.
    expect(suggestSlots("linkedin", 1)).toEqual([{ weekday: 2, hour: 14, minute: 0 }]); // Tuesday, middle of 11 a.m. to 5 p.m.
  });

  it("three a week are on three different days, in week order", () => {
    expect(suggestSlots("instagram", 3)).toEqual([
      { weekday: 1, hour: 15, minute: 0 },
      { weekday: 2, hour: 16, minute: 0 },
      { weekday: 3, hour: 16, minute: 0 },
    ]);
  });

  it("asks for more than the research supports and gets what it supports", () => {
    // Instagram's study has four good days (Mon to Thu) and no second window worth a post.
    expect(suggestSlots("instagram", 5)).toHaveLength(4);
    // TikTok has five days.
    expect(suggestSlots("tiktok", 5).map((s) => s.weekday)).toEqual([1, 2, 3, 4, 5]);
  });

  it("a second post on a day keeps at least three hours from the first", () => {
    const s = suggestSlots("youtube", 3); // only Tue and Wed, one 12 to 6 window each
    expect(s.length).toBeGreaterThanOrEqual(2);
    const byDay = new Map<number, number[]>();
    for (const x of s) byDay.set(x.weekday, [...(byDay.get(x.weekday) ?? []), x.hour]);
    for (const hours of byDay.values()) for (let i = 1; i < hours.length; i++) expect(hours[i] - hours[i - 1]).toBeGreaterThanOrEqual(3);
  });

  it("clamps silly counts", () => {
    expect(suggestSlots("instagram", 0)).toHaveLength(1);
    expect(suggestSlots("instagram", 99).length).toBeLessThanOrEqual(7);
  });
});

describe("describeSlot", () => {
  it("says the day and the hour", () => {
    expect(describeSlot({ weekday: 3, hour: 16, minute: 0 })).toBe("Wednesday 4 p.m.");
    expect(describeSlot({ weekday: 1, hour: 9, minute: 0 })).toBe("Monday 9 a.m.");
    expect(describeSlot({ weekday: 2, hour: 12, minute: 0 })).toBe("Tuesday 12 p.m.");
  });
});
