import { describe, it, expect } from "vitest";
import { computeStreak, localDayKey, dayRange, addDayKey, STREAK_MILESTONES } from "./streak";

const TODAY = "2026-09-07";

describe("localDayKey", () => {
  it("uses the viewer's zone, not UTC, for the day boundary", () => {
    // 22:00 UTC on the 6th is already the 7th in Asia/Kolkata (+05:30).
    const instant = new Date("2026-09-06T22:00:00Z");
    expect(localDayKey(instant, "Asia/Kolkata")).toBe("2026-09-07");
    expect(localDayKey(instant, "UTC")).toBe("2026-09-06");
  });

  it("rolls the other way for negative offsets", () => {
    // 02:00 UTC on the 7th is still the 6th in New York (-04:00).
    const instant = new Date("2026-09-07T02:00:00Z");
    expect(localDayKey(instant, "America/New_York")).toBe("2026-09-06");
  });

  it("falls back to UTC for an unknown zone instead of throwing", () => {
    expect(localDayKey(new Date("2026-09-07T12:00:00Z"), "Not/AZone")).toBe("2026-09-07");
  });
});

describe("computeStreak", () => {
  it("reports nothing for a workspace that has never published", () => {
    const s = computeStreak([], TODAY);
    expect(s).toMatchObject({ current: 0, longest: 0, status: "none", todayCompleted: false });
  });

  it("counts a first post today as a 1-day active streak", () => {
    const s = computeStreak([TODAY], TODAY);
    expect(s).toMatchObject({ current: 1, longest: 1, status: "active", todayCompleted: true });
    expect(s.startedOn).toBe(TODAY);
  });

  it("counts two consecutive days", () => {
    const s = computeStreak(["2026-09-06", TODAY], TODAY);
    expect(s.current).toBe(2);
    expect(s.startedOn).toBe("2026-09-06");
  });

  it("counts seven consecutive days and marks the milestone", () => {
    const days = dayRange("2026-09-01", TODAY);
    expect(days).toHaveLength(7);
    const s = computeStreak(days, TODAY);
    expect(s).toMatchObject({ current: 7, longest: 7, status: "active", reachedMilestone: 7 });
  });

  it("treats yesterday-only as at risk, not broken — today can still save it", () => {
    const s = computeStreak(["2026-09-05", "2026-09-06"], TODAY);
    expect(s.status).toBe("at_risk");
    expect(s.current).toBe(2);
    expect(s.todayCompleted).toBe(false);
  });

  it("breaks the streak once a day is missed", () => {
    // Published through the 4th, nothing on the 5th or 6th.
    const s = computeStreak(["2026-09-03", "2026-09-04"], TODAY);
    expect(s.status).toBe("broken");
    expect(s.current).toBe(0);
    expect(s.longest).toBe(2);
    expect(s.lastActiveOn).toBe("2026-09-04");
  });

  it("counts multiple posts on the same day only once", () => {
    const s = computeStreak([TODAY, TODAY, TODAY, "2026-09-06"], TODAY);
    expect(s.current).toBe(2);
    expect(s.totalActiveDays).toBe(2);
  });

  it("keeps the longest streak after a break and a rebuild", () => {
    const old = dayRange("2026-08-01", "2026-08-10"); // 10 days
    const now = dayRange("2026-09-06", TODAY); // 2 days
    const s = computeStreak([...old, ...now], TODAY);
    expect(s.current).toBe(2);
    expect(s.longest).toBe(10);
    expect(s.status).toBe("active");
  });

  it("spans a month boundary", () => {
    const s = computeStreak(dayRange("2026-08-29", "2026-09-02"), "2026-09-02");
    expect(s.current).toBe(5);
  });

  it("spans a year boundary", () => {
    const s = computeStreak(dayRange("2025-12-29", "2026-01-03"), "2026-01-03");
    expect(s.current).toBe(6);
  });

  it("handles a leap day", () => {
    const s = computeStreak(["2028-02-28", "2028-02-29", "2028-03-01"], "2028-03-01");
    expect(s.current).toBe(3);
  });

  it("ignores unsorted input and duplicates", () => {
    const s = computeStreak([TODAY, "2026-09-05", "2026-09-06", "2026-09-05"], TODAY);
    expect(s.current).toBe(3);
  });

  it("ignores malformed day keys rather than throwing", () => {
    const s = computeStreak(["nope", "", "2026-13-45", TODAY], TODAY);
    expect(s.current).toBe(1);
    expect(s.totalActiveDays).toBe(1);
  });

  it("does not let a future-dated publish inflate the streak", () => {
    // A publish timestamp ahead of today must not count as today's activity.
    const s = computeStreak(["2026-09-20"], TODAY);
    expect(s.todayCompleted).toBe(false);
    expect(s.status).toBe("broken");
    expect(s.current).toBe(0);
  });

  it("reports the next milestone and distance to it", () => {
    const s = computeStreak(dayRange("2026-09-03", TODAY), TODAY); // 5 days
    expect(s.current).toBe(5);
    expect(s.nextMilestone).toBe(7);
    expect(s.daysToNextMilestone).toBe(2);
    expect(s.reachedMilestone).toBeNull();
  });

  it("stops offering milestones past the final one", () => {
    const last = STREAK_MILESTONES[STREAK_MILESTONES.length - 1];
    const days = dayRange(addDayKey(TODAY, -(last + 5)), TODAY);
    const s = computeStreak(days, TODAY);
    expect(s.current).toBe(last + 6);
    expect(s.nextMilestone).toBeNull();
    expect(s.daysToNextMilestone).toBeNull();
  });

  it("only flags a milestone on the day it is reached", () => {
    // 8-day run: passed 7 yesterday, so nothing to celebrate today.
    const s = computeStreak(dayRange("2026-08-31", TODAY), TODAY);
    expect(s.current).toBe(8);
    expect(s.reachedMilestone).toBeNull();
  });

  it("never celebrates a milestone on an at-risk day", () => {
    const s = computeStreak(dayRange("2026-09-01", "2026-09-06"), TODAY); // 6 days, none today
    expect(s.status).toBe("at_risk");
    expect(s.reachedMilestone).toBeNull();
  });
});

describe("dayRange", () => {
  it("is inclusive at both ends", () => {
    expect(dayRange("2026-09-05", "2026-09-07")).toEqual(["2026-09-05", "2026-09-06", "2026-09-07"]);
  });

  it("returns nothing for an inverted or invalid range", () => {
    expect(dayRange("2026-09-07", "2026-09-01")).toEqual([]);
    expect(dayRange("bad", "2026-09-01")).toEqual([]);
  });
});
