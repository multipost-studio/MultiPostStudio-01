import { describe, it, expect } from "vitest";
import { upcomingOpenSlots } from "./queue-slots";

// Monday 2 Nov 2026, 12:00 UTC
const NOW = new Date("2026-11-02T12:00:00Z");
const slot = (channelId: string, weekday: number, hour: number, minute = 0) => ({ channelId, weekday, hour, minute });

describe("upcomingOpenSlots", () => {
  it("turns weekly wall-clock slots into real moments in the schedule's zone", () => {
    // Wednesday 16:00 in Kolkata is 10:30 UTC
    const r = upcomingOpenSlots({ slots: [slot("c1", 3, 16)], scheduled: [], slotTz: "Asia/Kolkata", from: NOW, days: 14 });
    expect(r.map((s) => s.at)).toEqual(["2026-11-04T10:30:00.000Z", "2026-11-11T10:30:00.000Z"]);
  });

  it("skips moments that have already passed", () => {
    // Monday 9:00 UTC is before "now" (12:00 UTC on Monday); the next Monday is next week
    const r = upcomingOpenSlots({ slots: [slot("c1", 1, 9)], scheduled: [], slotTz: "UTC", from: NOW, days: 14 });
    expect(r.map((s) => s.at)).toEqual(["2026-11-09T09:00:00.000Z"]);
  });

  it("a place a scheduled post already holds is not open, but another channel's is", () => {
    const scheduled = [{ channelIds: ["c1"], when: "2026-11-04T16:20:00.000Z" }]; // inside the 16:00 hour
    const r = upcomingOpenSlots({ slots: [slot("c1", 3, 16), slot("c2", 3, 16)], scheduled, slotTz: "UTC", from: NOW, days: 7 });
    expect(r).toEqual([{ channelId: "c2", at: "2026-11-04T16:00:00.000Z" }]);
  });

  it("matches the hour in the schedule's zone, not UTC", () => {
    // 10:45 UTC is 16:15 in Kolkata: that holds the Kolkata 16:00 slot
    const scheduled = [{ channelIds: ["c1"], when: "2026-11-04T10:45:00.000Z" }];
    expect(upcomingOpenSlots({ slots: [slot("c1", 3, 16)], scheduled, slotTz: "Asia/Kolkata", from: NOW, days: 7 })).toEqual([]);
  });

  it("is ordered by time, then channel", () => {
    const r = upcomingOpenSlots({ slots: [slot("b", 2, 9), slot("a", 2, 9), slot("a", 1, 15)], scheduled: [], slotTz: "UTC", from: NOW, days: 7 });
    expect(r.map((s) => `${s.at}|${s.channelId}`)).toEqual(["2026-11-02T15:00:00.000Z|a", "2026-11-03T09:00:00.000Z|a", "2026-11-03T09:00:00.000Z|b"]);
  });

  it("keeps the wall-clock time across a daylight saving change (New York fell back on 1 Nov 2026)", () => {
    const r = upcomingOpenSlots({ slots: [slot("c1", 2, 9)], scheduled: [], slotTz: "America/New_York", from: new Date("2026-10-26T12:00:00Z"), days: 14 });
    expect(r.map((s) => s.at)).toEqual(["2026-10-27T13:00:00.000Z", "2026-11-03T14:00:00.000Z"]); // 9:00 EDT then 9:00 EST
  });

  it("nothing for no slots or no days, and never more than 60 days", () => {
    expect(upcomingOpenSlots({ slots: [], scheduled: [], slotTz: "UTC", from: NOW, days: 14 })).toEqual([]);
    expect(upcomingOpenSlots({ slots: [slot("c", 1, 15)], scheduled: [], slotTz: "UTC", from: NOW, days: 0 })).toEqual([]);
    expect(upcomingOpenSlots({ slots: [slot("c", 1, 15)], scheduled: [], slotTz: "UTC", from: NOW, days: 9999 }).length).toBeLessThanOrEqual(9);
  });

  it("ignores a scheduled post with an unreadable time", () => {
    expect(upcomingOpenSlots({ slots: [slot("c1", 3, 16)], scheduled: [{ channelIds: ["c1"], when: "nope" }], slotTz: "UTC", from: NOW, days: 7 })).toHaveLength(1);
  });
});
