import { describe, expect, it } from "vitest";
import { DEFAULT_WINDOWS, interleaveByGroup, planSchedule, seededRandom } from "./blog-schedule";

const day = new Date("2026-10-07T00:00:00Z");

describe("planSchedule", () => {
  const plan = planSchedule({ startDay: day, count: 60, perDay: 3 });

  it("makes exactly 60 slots, 3 per UTC day, over 20 days", () => {
    expect(plan).toHaveLength(60);
    const perDay = new Map<string, number>();
    for (const d of plan) perDay.set(d.toISOString().slice(0, 10), (perDay.get(d.toISOString().slice(0, 10)) ?? 0) + 1);
    expect(perDay.size).toBe(20);
    expect([...perDay.values()].every((n) => n === 3)).toBe(true);
    expect(plan[0].toISOString().slice(0, 10)).toBe("2026-10-07");
    expect(plan[59].toISOString().slice(0, 10)).toBe("2026-10-26");
  });

  it("is sorted and every slot falls inside a daytime window", () => {
    for (let i = 1; i < plan.length; i++) expect(plan[i].getTime()).toBeGreaterThan(plan[i - 1].getTime());
    for (const d of plan) {
      const m = d.getUTCHours() * 60 + d.getUTCMinutes();
      expect(DEFAULT_WINDOWS.some(([a, b]) => m >= a && m < b)).toBe(true);
    }
  });

  it("looks random: minutes vary, and same-day slots are at least two hours apart", () => {
    expect(new Set(plan.map((d) => d.getUTCMinutes())).size).toBeGreaterThan(20);
    for (let i = 0; i < plan.length; i += 3) {
      expect(plan[i + 1].getTime() - plan[i].getTime()).toBeGreaterThanOrEqual(90 * 60_000);
      expect(plan[i + 2].getTime() - plan[i + 1].getTime()).toBeGreaterThanOrEqual(90 * 60_000);
    }
  });

  it("is deterministic per seed and differs across seeds", () => {
    const again = planSchedule({ startDay: day, count: 60, perDay: 3 });
    expect(again.map(String)).toEqual(plan.map(String));
    const other = planSchedule({ startDay: day, count: 60, perDay: 3, seed: 7 });
    expect(other.map(String)).not.toEqual(plan.map(String));
  });

  it("never schedules in the past when a floor is given", () => {
    const now = new Date("2026-10-07T09:00:00Z");
    const p = planSchedule({ startDay: day, count: 6, notBefore: now });
    expect(p.every((d) => d.getTime() > now.getTime())).toBe(true);
  });

  it("handles a partial last day", () => {
    expect(planSchedule({ startDay: day, count: 7, perDay: 3 })).toHaveLength(7);
  });
});

describe("interleaveByGroup", () => {
  it("round-robins groups so neighbours differ", () => {
    const items = ["a1", "a2", "a3", "b1", "b2", "b3", "c1", "c2", "c3"];
    const out = interleaveByGroup(items, (s) => s[0]);
    expect(out).toEqual(["a1", "b1", "c1", "a2", "b2", "c2", "a3", "b3", "c3"]);
    expect(new Set(out)).toEqual(new Set(items));
  });
  it("keeps uneven groups and is stable", () => {
    expect(interleaveByGroup(["a1", "a2", "b1"], (s) => s[0])).toEqual(["a1", "b1", "a2"]);
  });
});

describe("seededRandom", () => {
  it("returns values in [0,1)", () => {
    const r = seededRandom(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
