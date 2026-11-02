import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/page-header", () => ({ PageHeader: () => null }));
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

/**
 * The server renders in UTC; a visitor's browser does not. Anything that shows today, a post's day or its local time must not be
 * in the server HTML, or React reports "Hydration failed" (the /calendar error in Sentry). useHydrated() is false on the server,
 * so these pages must show a placeholder there.
 */
const noRec = { note: "", bestHour: null, insufficient: true };
const when = "2026-11-02T18:45:00.000Z"; // late evening UTC = already the next day in India

describe("server HTML of time-zone dependent pages", () => {
  it("the calendar shows a placeholder and no dates, times or post titles", () => {
    const html = renderToStaticMarkup(
      createElement(CalendarView, {
        posts: [{ id: "p1", title: "Launch post", status: "scheduled", campaignId: null, pillarId: null, when, platforms: ["instagram"], channelIds: ["c1"] }],
        channels: [{ id: "c1", name: "Shop", platform: "instagram" }],
        campaigns: [],
        pillars: [],
        canEdit: true,
      } as never),
    );
    expect(html).toContain("data-calendar-placeholder");
    expect(html).not.toContain("Launch post");
    expect(html).not.toMatch(/\b(January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d\b/);
    expect(html).not.toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/);
    // the filters and the view switcher are not time dependent and stay
    expect(html).toContain("Filter by channel");
  });

  it("the queue shows a placeholder instead of day groups and times", () => {
    const html = renderToStaticMarkup(
      createElement(QueueView, {
        canEdit: true,
        failed: [],
        recommendation: noRec,
        schedulerStale: true,
        schedulerLastRun: when,
        channels: [{ id: "c1", name: "Shop", platform: "instagram", paused: false, slotCount: 0 }],
        scheduled: [{ id: "p1", title: "Launch post", when, status: "scheduled", channelIds: ["c1"], platforms: ["instagram"] }],
      } as never),
    );
    expect(html).toContain("data-queue-placeholder");
    expect(html).not.toContain("Launch post");
    expect(html).not.toMatch(/\d{1,2}:\d{2}\s?(AM|PM)/);
    expect(html).not.toContain("Queue is empty");
  });

  it("an empty queue still says so on the server (no dates involved)", () => {
    const html = renderToStaticMarkup(
      createElement(QueueView, { canEdit: true, failed: [], recommendation: noRec, schedulerStale: false, schedulerLastRun: null, channels: [], scheduled: [] } as never),
    );
    expect(html).toContain("Queue is empty");
  });
});
