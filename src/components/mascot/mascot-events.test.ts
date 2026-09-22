import { describe, expect, it } from "vitest";
import { mergePrefs, passesCooldown } from "./mascot-events";
import { ASSISTANT_ACTIONS, FIRST_RUN_WINDOW_MS, MASCOT_COOLDOWN_MS, QUIET_HOURS, TOUR_STEPS, approvalsNudge, buildChecklist, contextActionFor, daySeedForDate, firstRunWelcome, greetingForHour, inQuietHours, inboxNudge, isFreshAccount, matchRouteMessage, milestoneTeaser, placeTourCard, streakSaver, tourInvite } from "./mascot-config";

describe("passesCooldown", () => {
  it("shows the first message unconditionally", () => {
    expect(passesCooldown({ lastShownAt: 0, now: 1_000 })).toBe(true);
  });

  it("throttles non-critical messages inside the cooldown window", () => {
    expect(passesCooldown({ lastShownAt: 1_000, now: 1_000 + MASCOT_COOLDOWN_MS - 1 })).toBe(false);
  });

  it("allows non-critical messages once the cooldown elapses", () => {
    expect(passesCooldown({ lastShownAt: 1_000, now: 1_000 + MASCOT_COOLDOWN_MS })).toBe(true);
  });

  it("lets critical success/error feedback bypass the cooldown", () => {
    expect(passesCooldown({ critical: true, lastShownAt: 1_000, now: 1_001 })).toBe(true);
  });
});

describe("mergePrefs", () => {
  it("falls back to defaults for missing or malformed input", () => {
    expect(mergePrefs(null)).toEqual({ muted: false, hidden: false, tourDone: false, vibe: "calm" });
    expect(mergePrefs("nope")).toEqual({ muted: false, hidden: false, tourDone: false, vibe: "calm" });
    expect(mergePrefs([])).toEqual({ muted: false, hidden: false, tourDone: false, vibe: "calm" });
  });

  it("keeps stored flags and drops unknown keys", () => {
    expect(mergePrefs({ muted: true, hidden: 1, tourDone: true, extra: "x" })).toEqual({
      muted: true,
      hidden: false,
      tourDone: true,
      vibe: "calm",
    });
  });

  it("keeps a stored hype vibe and normalizes anything else to calm", () => {
    expect(mergePrefs({ vibe: "hype" }).vibe).toBe("hype");
    expect(mergePrefs({ vibe: "loud" }).vibe).toBe("calm");
    expect(mergePrefs({}).vibe).toBe("calm");
  });
});

describe("matchRouteMessage", () => {
  it("matches exact routes and nested routes", () => {
    expect(matchRouteMessage("/dashboard", new Date(2026, 8, 22, 9))?.title).toBe("Good morning");
    expect(matchRouteMessage("/calendar")?.title).toContain("content plan");
    expect(matchRouteMessage("/composer")?.title).toContain("create something");
  });

  it("prefers the longest matching prefix", () => {
    // /analytics/report/* must resolve to the analytics hint, not nothing.
    expect(matchRouteMessage("/analytics/report/summary")?.tone).toBe("info");
    // /composer/new has its own hint shadowing the generic composer one.
    expect(matchRouteMessage("/composer/new")?.title).toContain("Blank canvas");
    expect(matchRouteMessage("/composer/grid")?.title).toContain("Looking sharp");
  });

  it("covers the deeper app sections", () => {
    expect(matchRouteMessage("/approvals")?.title).toContain("slips through");
    expect(matchRouteMessage("/reports/builder")?.title).toContain("progress");
    expect(matchRouteMessage("/team")?.title).toContain("one brand");
    expect(matchRouteMessage("/settings/billing")?.title).toContain("engine room");
  });

  it("returns null for routes without a contextual hint", () => {
    expect(matchRouteMessage("/login")).toBeNull();
    expect(matchRouteMessage("/signup")).toBeNull();
  });

  it("greets by time of day on the dashboard", () => {
    expect(greetingForHour(2)).toBe("Burning the midnight oil");
    expect(greetingForHour(9)).toBe("Good morning");
    expect(greetingForHour(14)).toBe("Good afternoon");
    expect(greetingForHour(21)).toBe("Good evening");
    expect(matchRouteMessage("/dashboard", new Date(2026, 8, 22, 15))?.title).toBe("Good afternoon");
  });

  it("opens the week with momentum on Mondays", () => {
    // 2026-09-21 is a Monday.
    expect(matchRouteMessage("/dashboard", new Date(2026, 8, 21, 9))?.title).toContain("fresh week");
  });

  it("rotates variant copy deterministically by day", () => {
    const a = new Date(2026, 8, 22, 10);
    const b = new Date(2026, 8, 23, 10);
    // Same day → same line; seed math is deterministic.
    expect(matchRouteMessage("/ideas", a)?.title).toBe(matchRouteMessage("/ideas", a)?.title);
    expect(daySeedForDate(a)).not.toBe(daySeedForDate(b));
    // All variants come from the curated pool.
    const pool = [
      "Looking good — keep the ideas coming",
      "Today's stray thought is next week's best post",
      "Bank three ideas now, thank yourself on Friday",
    ];
    expect(pool).toContain(matchRouteMessage("/ideas", b)?.title);
  });

  it("swaps calm pools for hype pools when hyped", () => {
    const day = new Date(2026, 8, 22, 10);
    const hypePool = [
      "Idea machine: ACTIVATED. Keep them coming",
      "That stray thought? Next week's breakout post",
      "Bank three bangers now, thank yourself Friday",
    ];
    expect(hypePool).toContain(matchRouteMessage("/ideas", day, "hype")?.title);
    expect(hypePool).not.toContain(matchRouteMessage("/ideas", day, "calm")?.title);
  });

  it("attaches a next-step action where one exists", () => {
    expect(matchRouteMessage("/analytics")).toMatchObject({
      actionLabel: "Build a report",
      actionHref: "/reports/builder",
    });
    expect(matchRouteMessage("/campaigns")).toMatchObject({
      actionLabel: "Create a campaign",
      actionHref: "/campaigns?new=1",
    });
    expect(matchRouteMessage("/queue")).toMatchObject({
      actionLabel: "Open calendar",
      actionHref: "/calendar",
    });
  });
});

describe("first-run welcome", () => {

  it("treats accounts inside the window as fresh", () => {
    const now = Date.now();
    expect(isFreshAccount({ createdAtMs: now - 1_000, nowMs: now })).toBe(true);
    expect(isFreshAccount({ createdAtMs: now - FIRST_RUN_WINDOW_MS + 1_000, nowMs: now })).toBe(true);
    expect(isFreshAccount({ createdAtMs: now - FIRST_RUN_WINDOW_MS - 1_000, nowMs: now })).toBe(false);
  });

  it("welcomes by first name with a one-tap tour action", () => {
    expect(firstRunWelcome("Ada Lovelace")).toMatchObject({
      title: "Welcome aboard, Ada",
      actionTour: true,
    });
    expect(firstRunWelcome()).toMatchObject({
      title: "Welcome to MultiPost Studio",
      actionTour: true,
    });
  });

  it("nudges existing users who never toured", () => {
    expect(tourInvite()).toMatchObject({
      title: "Psst — want the grand tour?",
      actionTour: true,
    });
  });

  it("warns before a streak breaks tonight", () => {
    expect(streakSaver(6)).toMatchObject({
      title: "Your 6-day streak ends tonight",
      tone: "warning",
      actionLabel: "Schedule a post",
      actionHref: "/composer/new",
    });
  });
});

describe("work nudges", () => {
  it("counts approvals with singular/plural copy", () => {
    expect(approvalsNudge(1)).toMatchObject({
      title: "1 post is awaiting your review",
      actionHref: "/approvals",
    });
    expect(approvalsNudge(4).title).toBe("4 posts are awaiting your review");
  });

  it("points inbox attention at the inbox", () => {
    expect(inboxNudge(2)).toMatchObject({
      title: "2 conversations need replies",
      actionHref: "/inbox",
    });
  });

  it("teases near milestones with singular/plural copy", () => {
    expect(milestoneTeaser(14, 1)).toMatchObject({
      title: "1 day to your 14-day milestone",
      actionHref: "/insights/streak",
    });
    expect(milestoneTeaser(30, 2).title).toBe("2 days to your 30-day milestone");
  });
});

describe("quiet hours", () => {
  it("holds casual nudges between midnight and 6am", () => {
    expect(QUIET_HOURS).toEqual({ from: 0, to: 6 });
    expect(inQuietHours(0)).toBe(true);
    expect(inQuietHours(5)).toBe(true);
    expect(inQuietHours(6)).toBe(false);
    expect(inQuietHours(14)).toBe(false);
    expect(inQuietHours(23)).toBe(false);
  });
});

describe("buildChecklist", () => {
  it("marks done flags from server progress with real routes", () => {
    const items = buildChecklist({ connected: true, created: false, scheduled: false });
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ done: true, href: "/integrations" });
    expect(items[1]).toMatchObject({ done: false, href: "/composer/new" });
    expect(items[2]).toMatchObject({ done: false, href: "/calendar" });
    for (const item of items) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.label.length).toBeGreaterThan(0);
    }
  });

  it("completes fully for established workspaces", () => {
    const items = buildChecklist({ connected: true, created: true, scheduled: true });
    expect(items.every((i) => i.done)).toBe(true);
  });
});

describe("contextActionFor", () => {
  it("suggests the most useful next step per section", () => {
    expect(contextActionFor("/composer/new")).toMatchObject({ href: "/calendar" });
    expect(contextActionFor("/calendar")).toMatchObject({ href: "/composer/new" });
    expect(contextActionFor("/analytics")).toMatchObject({ href: "/reports/builder" });
    expect(contextActionFor("/reports/builder")).toMatchObject({ href: "/analytics" });
  });

  it("returns null where no suggestion beats the standard list", () => {
    expect(contextActionFor("/dashboard")).toBeNull();
    expect(contextActionFor("/login")).toBeNull();
  });
});

describe("assistant + tour config", () => {
  it("exposes navigation actions that point at real routes", () => {
    const hrefs = ASSISTANT_ACTIONS.filter((a) => a.href).map((a) => a.href);
    for (const href of ["/composer/new", "/calendar", "/integrations", "/analytics", "/help"]) {
      expect(hrefs).toContain(href);
    }
    expect(ASSISTANT_ACTIONS.some((a) => a.tour)).toBe(true);
  });

  it("walks six real routes, ending back at the dashboard", () => {
    expect(TOUR_STEPS).toHaveLength(6);
    expect(TOUR_STEPS[0].route).toBe("/dashboard");
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].route).toBe("/dashboard");
    for (const step of TOUR_STEPS) {
      expect(step.route.startsWith("/")).toBe(true);
      expect(step.title.length).toBeGreaterThan(0);
    }
  });

  it("spotlights a real UI element on every step except the finale", () => {
    const targeted = TOUR_STEPS.filter((s) => s.target);
    expect(targeted).toHaveLength(5);
    for (const step of targeted) {
      expect(step.target).toMatch(/^\[data-tour="[a-z]+"\]$/);
    }
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].target).toBeUndefined();
  });
});

describe("placeTourCard", () => {
  const viewport = { w: 1280, h: 800 };
  const card = { w: 320, h: 280 };

  it("docks below the target when there is room", () => {
    const p = placeTourCard(viewport, { x: 100, y: 100, width: 400, height: 60 }, card);
    expect(p).toEqual({ top: 172, left: 100 });
  });

  it("docks above the target when below would overflow", () => {
    const p = placeTourCard(viewport, { x: 100, y: 600, width: 400, height: 60 }, card);
    expect(p).toEqual({ top: 600 - 12 - 280, left: 100 });
  });

  it("clamps horizontally inside narrow viewports", () => {
    const p = placeTourCard({ w: 375, h: 700 }, { x: 300, y: 100, width: 60, height: 40 }, card);
    expect(p.left).toBe(375 - 320 - 12);
    expect(p.left + card.w).toBeLessThanOrEqual(375);
  });

  it("falls back above the companion corner without a target", () => {
    const p = placeTourCard(viewport, null, card);
    expect(p).toEqual({ top: 800 - 280 - 132, left: 1280 - 320 - 12 });
  });

  it("never returns off-viewport positions", () => {
    const p = placeTourCard({ w: 320, h: 500 }, { x: 0, y: 0, width: 320, height: 500 }, { w: 320, h: 400 });
    expect(p.top).toBeGreaterThanOrEqual(12);
    expect(p.left).toBeGreaterThanOrEqual(12);
  });
});
