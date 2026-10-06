import { describe, it, expect } from "vitest";
import {
  DASHBOARD_WIDGETS,
  DEFAULT_DASHBOARD_PREFS,
  moveWidget,
  normalizeDashboardPrefs,
  normalizeSidebarPrefs,
  reorderWidget,
  widgetsInZone,
  type WidgetId,
} from "./ui-prefs";

const ALL = DASHBOARD_WIDGETS.map((w) => w.id);

describe("normalizeDashboardPrefs", () => {
  it("returns defaults for garbage input", () => {
    for (const bad of [null, undefined, 5, "x", [], {}]) {
      expect(normalizeDashboardPrefs(bad)).toEqual(DEFAULT_DASHBOARD_PREFS);
    }
  });

  it("drops unknown ids, dedupes, and appends widgets missing from storage", () => {
    const r = normalizeDashboardPrefs({ order: ["goals", "bogus", "goals", "health"], hidden: ["nope", "ai", "ai"] });
    expect(r.order.slice(0, 2)).toEqual(["goals", "health"]);
    expect([...r.order].sort()).toEqual([...ALL].sort());
    expect(r.hidden).toEqual(["ai"]);
  });

  it("only accepts the known layouts", () => {
    expect(normalizeDashboardPrefs({ layout: "stacked" }).layout).toBe("stacked");
    expect(normalizeDashboardPrefs({ layout: "weird" }).layout).toBe("split");
  });
});

describe("normalizeSidebarPrefs", () => {
  it("defaults to showing promos with nothing hidden", () => {
    expect(normalizeSidebarPrefs(null)).toEqual({ showPromos: true, hiddenGroups: [] });
  });

  it("restricts hidden groups to the valid set", () => {
    const r = normalizeSidebarPrefs({ showPromos: false, hiddenGroups: ["Create", "", "Evil", "Create"] }, ["Create", "Publish"]);
    expect(r).toEqual({ showPromos: false, hiddenGroups: ["Create"] });
  });
});

describe("reordering", () => {
  const order = [...ALL] as WidgetId[];

  it("moveWidget swaps within the zone and stops at the edges", () => {
    const m = moveWidget(order, "performance", -1);
    expect(widgetsInZone(m, [], "main").slice(0, 2)).toEqual(["performance", "priorities"]);
    expect(moveWidget(order, "priorities", -1)).toEqual(order);
    expect(moveWidget(order, "activity", 1)).toEqual(order);
  });

  it("reorderWidget places an item at the target and never crosses zones", () => {
    const r = reorderWidget(order, "ai", "priorities");
    expect(widgetsInZone(r, [], "main")).toEqual(["ai", "priorities", "performance", "upcoming", "published", "blogs"]);
    expect(reorderWidget(order, "ai", "streak")).toEqual(order);
    expect(r).toHaveLength(ALL.length);
  });

  it("widgetsInZone skips hidden widgets", () => {
    expect(widgetsInZone(order, ["performance"], "main")).toEqual(["priorities", "ai", "upcoming", "published", "blogs"]);
  });
});
