import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let zone = "UTC";
vi.mock("@/lib/use-calendar-timezone", () => ({ useCalendarTimeZone: () => ({ timeZone: zone, deviceZone: "UTC", isDevice: zone === "UTC", setTimeZone: vi.fn() }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/page-header", () => ({ PageHeader: () => null }));
vi.mock("@/lib/use-hydrated", () => ({ useHydrated: () => true }));
vi.mock("@/app/actions/posting-times", () => ({ applySuggestedTimesAction: vi.fn(), setProfileTimezoneAction: vi.fn() }));
vi.mock("@/app/actions/posts", () => ({
  rescheduleAction: vi.fn(),
  bulkDeletePostsAction: vi.fn(),
  bulkDuplicatePostsAction: vi.fn(),
  bulkUnschedulePostsAction: vi.fn(),
  toggleChannelQueueAction: vi.fn(),
  retryPublishAction: vi.fn(),
  unscheduleAction: vi.fn(),
}));
vi.mock("./calendar-import", () => ({ ImportPostsButton: () => null }));

import { CalendarView } from "./calendar-view";
import { QueueView } from "../queue/queue-view";

// 18:45 UTC on 2 Nov 2026 is already 12:15 AM on the 3rd in Kolkata and 1:45 PM on the 2nd in New York.
const when = "2026-11-02T18:45:00.000Z";
const post = { id: "p1", title: "Launch post", status: "scheduled", campaignId: null, pillarId: null, when, platforms: ["instagram"], channelIds: ["c1"] };
const calendar = () =>
  renderToStaticMarkup(createElement(CalendarView, { posts: [post], channels: [{ id: "c1", name: "Shop", platform: "instagram" }], campaigns: [], pillars: [], canEdit: true } as never));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("the calendar shows each post at its time in the chosen zone", () => {
  it("UTC", () => {
    zone = "UTC";
    const h = calendar();
    expect(h).toContain("6:45 PM");
    expect(h).toContain("Launch post");
  });

  it("Kolkata: the same post reads 12:15 AM (it is already the next day there)", () => {
    zone = "Asia/Kolkata";
    const h = calendar();
    expect(h).toContain("12:15 AM");
    expect(h).not.toContain("6:45 PM");
  });

  it("New York: 1:45 PM on the same day", () => {
    zone = "America/New_York";
    const h = calendar();
    expect(h).toContain("1:45 PM");
    expect(h).not.toContain("12:15 AM");
  });

  it("the toolbar offers the zone menu with the chosen city on it", () => {
    zone = "Asia/Kolkata";
    const h = calendar();
    expect(h).toContain("Times are shown in Asia/Kolkata");
    expect(h).toContain(">Kolkata<");
  });

  it("the post lands on the day it falls on in that zone", () => {
    const dayOf = (h: string) => {
      // the chip sits inside its day cell: take the number printed in the cell just before the chip
      const before = h.slice(0, h.indexOf("Launch post"));
      const nums = [...before.matchAll(/text-\[12px\] font-medium[^>]*>(\d{1,2})<\/span>/g)];
      return Number(nums.at(-1)?.[1]);
    };
    zone = "UTC";
    expect(dayOf(calendar())).toBe(2);
    zone = "Asia/Kolkata";
    expect(dayOf(calendar())).toBe(3);
    zone = "America/Los_Angeles";
    expect(dayOf(calendar())).toBe(2);
  });
});

describe("the queue shows the same zone", () => {
  const queue = () =>
    renderToStaticMarkup(
      createElement(QueueView, {
        canEdit: true,
        failed: [],
        recommendation: { note: "", bestHour: null, insufficient: true },
        schedulerStale: false,
        schedulerLastRun: null,
        channels: [{ id: "c1", name: "Shop", platform: "instagram", paused: false, slotCount: 0 }],
        scheduled: [{ id: "p1", title: "Launch post", when, status: "scheduled", channelIds: ["c1"], platforms: ["instagram"] }],
      } as never),
    );

  it("lists the post under the day and time it has in that zone", () => {
    zone = "Asia/Kolkata";
    const h = queue();
    expect(h).toContain("12:15 AM");
    expect(h).toMatch(/Tuesday, Nov 3|Tue, Nov 3|Tuesday, Nov\.? 3/i);
    zone = "America/New_York";
    const ny = queue();
    expect(ny).toContain("1:45 PM");
    expect(ny).toMatch(/Mon(day)?,? Nov\.? 2/i);
  });
});
