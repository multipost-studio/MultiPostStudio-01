import { describe, expect, it } from "vitest";
import { JOBS, formatAge, jobStatus, parseStamp } from "./admin-automations";

const NOW = new Date("2026-10-09T12:00:00Z");
const stamp = (offsetMs: number) => JSON.stringify(new Date(NOW.getTime() - offsetMs).toISOString());
const job = (key: string) => JOBS.find((j) => j.key === key)!;

describe("parseStamp", () => {
  it("reads the JSON-encoded ISO time the jobs write", () => {
    expect(parseStamp(JSON.stringify("2026-10-09T11:00:00.000Z"))?.toISOString()).toBe("2026-10-09T11:00:00.000Z");
  });
  it("treats empty, malformed and non-string stamps as never", () => {
    for (const bad of [null, undefined, "", "not json", "123", JSON.stringify("garbage"), JSON.stringify({ a: 1 })]) expect(parseStamp(bad)).toBeNull();
  });
});

describe("jobStatus", () => {
  it("is healthy inside the window and late after it", () => {
    expect(jobStatus(job("tick"), stamp(2 * 60_000), NOW, true).state).toBe("healthy");
    expect(jobStatus(job("tick"), stamp(16 * 60_000), NOW, true).state).toBe("late");
  });
  it("is never when there is no stamp", () => {
    expect(jobStatus(job("janitor"), null, NOW, true)).toEqual({ state: "never", lastRunAt: null, ageMs: null });
  });
  it("does not report billing reconciliation as late when billing is not configured", () => {
    expect(jobStatus(job("billing"), null, NOW, false).state).toBe("not-configured");
    expect(jobStatus(job("billing"), stamp(48 * 3_600_000), NOW, true).state).toBe("late");
  });
  it("never reports a negative age for a stamp slightly in the future", () => {
    expect(jobStatus(job("tick"), JSON.stringify(new Date(NOW.getTime() + 5000).toISOString()), NOW, true).ageMs).toBe(0);
  });
});

describe("registry and formatting", () => {
  it("has unique keys and stamps", () => {
    expect(new Set(JOBS.map((j) => j.key)).size).toBe(JOBS.length);
    expect(new Set(JOBS.map((j) => j.stamp)).size).toBe(JOBS.length);
  });
  it("formats ages", () => {
    expect(formatAge(10_000)).toBe("just now");
    expect(formatAge(5 * 60_000)).toBe("5 min ago");
    expect(formatAge(3 * 3_600_000)).toBe("3 h ago");
    expect(formatAge(5 * 86_400_000)).toBe("5 days ago");
  });
});
