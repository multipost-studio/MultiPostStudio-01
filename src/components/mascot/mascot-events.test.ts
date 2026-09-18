import { describe, expect, it } from "vitest";
import { mergePrefs, passesCooldown } from "./mascot-events";
import { ASSISTANT_ACTIONS, MASCOT_COOLDOWN_MS, TOUR_STEPS, matchRouteMessage, placeTourCard } from "./mascot-config";

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
    expect(mergePrefs(null)).toEqual({ muted: false, hidden: false, tourDone: false });
    expect(mergePrefs("nope")).toEqual({ muted: false, hidden: false, tourDone: false });
    expect(mergePrefs([])).toEqual({ muted: false, hidden: false, tourDone: false });
  });

  it("keeps stored flags and drops unknown keys", () => {
    expect(mergePrefs({ muted: true, hidden: 1, tourDone: true, extra: "x" })).toEqual({
      muted: true,
      hidden: false,
      tourDone: true,
    });
  });
});

describe("matchRouteMessage", () => {
  it("matches exact routes and nested routes", () => {
    expect(matchRouteMessage("/dashboard")?.title).toBe("Welcome back");
    expect(matchRouteMessage("/calendar")?.title).toContain("content plan");
    expect(matchRouteMessage("/composer/new")?.title).toContain("create something");
  });

  it("prefers the longest matching prefix", () => {
    // /analytics/report/* must resolve to the analytics hint, not nothing.
    expect(matchRouteMessage("/analytics/report/summary")?.tone).toBe("info");
  });

  it("returns null for routes without a contextual hint", () => {
    expect(matchRouteMessage("/settings/billing")).toBeNull();
    expect(matchRouteMessage("/login")).toBeNull();
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
