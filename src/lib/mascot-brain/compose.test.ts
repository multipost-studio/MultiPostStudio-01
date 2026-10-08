import { describe, it, expect } from "vitest";
import { NAV, SETTINGS_NAV } from "@/lib/nav";
import { composeAnswer } from "./compose";
import { calmFacts } from "./fixtures";
import { buildInsights } from "./insights";
import { parseIntent, type RouteEntry } from "./intents";
import type { WorkspaceFacts } from "./types";

const routes: RouteEntry[] = [...NAV.flatMap((g) => g.items.map((i) => ({ label: i.label, href: i.href }))), ...SETTINGS_NAV.map((s) => ({ label: s.label, href: s.href }))];
const reply = (q: string, f: WorkspaceFacts = calmFacts()) => composeAnswer(parseIntent(q, routes), f, buildInsights(f));

describe("schedule answers", () => {
  const f = calmFacts({
    timeZone: "Asia/Kolkata",
    scheduled: {
      today: [
        { id: "a", title: "Launch teaser", at: "2026-10-06T04:00:00Z", platforms: ["instagram", "x"] },
        { id: "b", title: "Behind the scenes", at: "2026-10-06T09:30:00Z", platforms: ["linkedin"] },
      ],
      tomorrow: [],
      next24h: 2,
      nextAt: "2026-10-07T05:00:00Z",
      overdue: 0,
      byDay: calmFacts().scheduled.byDay,
    },
  });

  it("lists today's posts with times in the viewer's zone and links to each", () => {
    const a = reply("what's scheduled today", f);
    expect(a.title).toBe("2 posts scheduled today");
    expect(a.items[0]).toMatchObject({ label: "9:30 AM · Launch teaser", sub: "instagram, x", href: "/composer/a" });
    expect(a.items[1].label).toBe("3:00 PM · Behind the scenes");
  });

  it("says so, and points at the next one, when nothing is scheduled", () => {
    const a = reply("anything scheduled tomorrow", f);
    expect(a.title).toBe("Nothing is scheduled tomorrow");
    expect(a.lines[0]).toContain("The next one goes out");
    expect(a.actions.map((x) => x.href)).toContain("/composer/new");
  });

  it("summarises the week and names the empty days", () => {
    const byDay = calmFacts().scheduled.byDay.map((d, i) => ({ ...d, count: i === 1 ? 3 : 0 }));
    const a = reply("what's coming up this week", calmFacts({ scheduled: { ...calmFacts().scheduled, byDay } }));
    expect(a.title).toBe("3 posts scheduled over the next 7 days");
    expect(a.lines[0]).toMatch(/^6 days still empty/);
    expect(a.items).toHaveLength(7);
  });
});

describe("problem answers", () => {
  it("reports failed posts with their real error", () => {
    const f = calmFacts({ failed: { count7d: 2, recent: [{ id: "x", title: "Sale post", at: null, platforms: ["x"], error: "Rate limit hit" }] } });
    const a = reply("any failed posts?", f);
    expect(a.title).toBe("2 posts failed in the last 7 days");
    expect(a.items[0].sub).toContain("Rate limit hit");
    expect(a.actions[0].href).toBe("/queue");
  });

  it("is happy to say there is nothing wrong", () => {
    expect(reply("any failed posts?").title).toBe("No failed posts");
  });

  it("briefing leads with what is urgent, in order", () => {
    const f = calmFacts({ failed: { count7d: 1, recent: [] }, approvals: { pending: 2, oldestDays: 1, recent: [] } });
    const a = reply("what should I focus on today", f);
    expect(a.title).toBe("2 things need you");
    expect(a.items[0].label).toBe("1 post failed to publish");
  });

  it("briefing admits when everything is calm", () => {
    expect(reply("catch me up").title).toBe("Nothing needs you right now");
  });
});

describe("honest about data", () => {
  it("does not invent a best time", () => {
    const a = reply("when is the best time to post?");
    expect(a.title).toBe("Not enough data to say yet");
    expect(a.lines.join(" ")).toContain("rather than guessing");
  });

  it("reports a measured best time", () => {
    const a = reply("best time to post", calmFacts({ bestTime: { insufficient: false, label: "Friday at 09:00", engagement: 7.04, posts: 12, note: "" } }));
    expect(a.title).toBe("Your best time: Friday at 09:00");
    expect(a.lines[0]).toContain("7.0% engagement across 12 posts");
  });

  it("answers usage with real limits and warns when close", () => {
    const f = calmFacts({ usage: { ai: { used: 95, limit: 100, pct: 95 }, scheduled: { used: 1, limit: 100, pct: 1 }, channels: { used: 1, limit: 10, pct: 10 } } });
    const a = reply("how many ai credits do I have left", f);
    expect(a.title).toBe("You are close to a limit");
    expect(a.items[0].sub).toBe("95 of 100 (95%)");
  });
});

describe("permissions", () => {
  it("declines instead of answering what the viewer cannot access", () => {
    const viewer = calmFacts({ perms: ["analytics.view"], approvals: { pending: 3, oldestDays: 2, recent: [{ id: "1", title: "Secret" }] } });
    const a = reply("anything waiting for my review", viewer);
    expect(a.title).toBe("That one is outside your role");
    expect(JSON.stringify(a)).not.toContain("Secret");
    expect(reply("how many ai credits", viewer).title).toBe("That one is outside your role");
    expect(reply("any comments to reply to", viewer).title).toBe("That one is outside your role");
  });

  it("a user with no content access cannot read the schedule", () => {
    const nobody = calmFacts({ perms: [] });
    expect(reply("what's scheduled today", nobody).title).toBe("That one is outside your role");
  });
});

describe("help and navigation", () => {
  it("gives steps and a link for a how-to", () => {
    const a = reply("how do I connect instagram");
    expect(a.title).toBe("Connect a social account");
    expect(a.lines.length).toBeGreaterThan(1);
    expect(a.actions[0].href).toBe("/integrations");
  });

  it("offers a button for a page and never auto-navigates", () => {
    const a = reply("open the calendar");
    expect(a.actions).toEqual([{ label: "Go to Calendar", href: "/calendar" }]);
  });

  it("falls back to suggestions at low confidence", () => {
    const a = reply("blorp flarn");
    expect(a.confidence).toBeLessThan(0.45);
    expect(a.followUps.length).toBeGreaterThan(0);
  });

  it("only links to routes that exist in the app", () => {
    const known = new Set([...routes.map((r) => r.href), "/composer/new", "/ideas?new=1", "/insights/streak", "/reports/builder", "/queue"]);
    const f = calmFacts({ failed: { count7d: 1, recent: [] }, approvals: { pending: 1, oldestDays: 0, recent: [] }, inbox: { open: 1, negative: 0 }, accounts: { total: 1, connected: 0, broken: [{ name: "A", platform: "x", status: "error" }], expiring: [] } });
    for (const q of ["any failed posts", "pending approvals", "unread messages", "are my accounts connected", "how many credits", "social health score", "how am i doing this week", "streak", "create a post", "catch me up"]) {
      const a = reply(q, f);
      for (const l of [...a.actions, ...a.items.map((i) => ({ href: i.href }))]) {
        if (l.href && !l.href.startsWith("/composer/")) expect(known.has(l.href), `${q} -> ${l.href}`).toBe(true);
      }
    }
  });
});
