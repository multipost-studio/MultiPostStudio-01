import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/page-header", () => ({ PageHeader: () => null }));
vi.mock("@/lib/use-hydrated", () => ({ useHydrated: () => true }));
vi.mock("@/app/actions/posts", () => ({
  rescheduleAction: vi.fn(),
  bulkDeletePostsAction: vi.fn(),
  bulkDuplicatePostsAction: vi.fn(),
  bulkUnschedulePostsAction: vi.fn(),
}));
vi.mock("./calendar-import", () => ({ ImportPostsButton: () => null }));

import { CalendarView, NoDatePanel } from "./calendar-view";

const today = new Date();
today.setHours(12, 0, 0, 0);
const post = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Post ${id}`,
  status: "scheduled",
  campaignId: null,
  pillarId: null,
  when: today.toISOString(),
  platforms: ["instagram"],
  channelIds: ["c1"],
  ...over,
});
const view = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(CalendarView, { posts: [], channels: [{ id: "c1", name: "Shop", platform: "instagram" }], campaigns: [], pillars: [], canEdit: true, ...props } as never),
  );

describe("calendar toolbar", () => {
  it("is one row: previous, next, Today, a view menu, the filters and the No date button", () => {
    const h = view();
    for (const text of ['aria-label="Previous"', 'aria-label="Next"', "Today", 'aria-label="Calendar view"', "Filter by channel", "Filter by status", "No date"]) expect(h).toContain(text);
    for (const v of ["Month", "Week", "Day", "List"]) expect(h).toContain(`>${v}</option>`);
  });

  it("shows campaign and pillar filters only when there are any", () => {
    const bare = view();
    expect(bare).not.toContain("Filter by campaign");
    expect(bare).not.toContain("Filter by pillar");
    const full = view({ campaigns: [{ id: "k", name: "Launch", color: "#f00" }], pillars: [{ id: "p", name: "Tips", color: "#0f0" }] });
    expect(full).toContain("Filter by campaign");
    expect(full).toContain("Filter by pillar");
  });

  it("counts posts without a date on the No date button", () => {
    expect(view({ undated: [post("a"), post("b")] })).toMatch(/No date<span[^>]*>2<\/span>/);
    expect(view()).not.toMatch(/No date<span/);
  });
});

describe("calendar days", () => {
  it("lists three posts in a day on larger screens, then \"+N more\" that opens the day", () => {
    const h = view({ posts: ["1", "2", "3", "4", "5"].map((id) => post(id)) });
    expect(h).toContain("Post 1");
    expect(h).toContain("Post 3");
    // phones show two posts and count the rest (+3); larger screens show three and count the rest (+2)
    expect(h).toContain("+3 more");
    expect(h).toContain("+2 more");
  });

  it("with three posts there is only the phone count, no extra button on larger screens", () => {
    const h = view({ posts: [post("1"), post("2"), post("3")] });
    expect(h.match(/\+\d+ more/g)).toEqual(["+1 more"]);
  });

  it("marks a failed post", () => {
    expect(view({ posts: [post("1", { status: "failed" })] })).toContain("Failed");
  });
});

describe("No date panel", () => {
  it("explains itself when empty", () => {
    const h = renderToStaticMarkup(createElement(NoDatePanel, { posts: [], hasFilters: false, onClose: () => {} }));
    expect(h).toContain("No drafts without a date");
    expect(h).toContain("Drafts and approvals without a scheduled date will appear here.");
  });

  it("lists each draft and links to its editor", () => {
    const h = renderToStaticMarkup(createElement(NoDatePanel, { posts: [post("a", { status: "draft" }) as never], hasFilters: false, onClose: () => {} }));
    expect(h).toContain("Post a");
    expect(h).toContain('href="/composer/a"');
  });

  it("says so when filters hide everything", () => {
    expect(renderToStaticMarkup(createElement(NoDatePanel, { posts: [], hasFilters: true, onClose: () => {} }))).toContain("Nothing matches these filters");
  });
});
