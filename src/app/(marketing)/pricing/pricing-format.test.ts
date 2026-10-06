import { describe, it, expect } from "vitest";
import { PLAN_CATALOG } from "@/lib/constants";
import { annualSaving, everyPlanItems, fmtLimit, fmtStorage, limitStats, PLAN_BLURB, planHighlights } from "./pricing-format";

describe("formatting limits", () => {
  it("treats 0 as unlimited, and groups thousands", () => {
    expect(fmtLimit(0)).toBe("Unlimited");
    expect(fmtLimit(-1)).toBe("Unlimited");
    expect(fmtLimit(25)).toBe("25");
    expect(fmtLimit(10000)).toBe("10,000");
  });

  it("shows storage in MB below 1,000 and GB above", () => {
    expect(fmtStorage(200)).toBe("200 MB");
    expect(fmtStorage(5000)).toBe("5 GB");
    expect(fmtStorage(1500)).toBe("1.5 GB");
    expect(fmtStorage(0)).toBe("Unlimited");
  });

  it("builds six stats with correct singular labels", () => {
    const s = limitStats({ workspaces: 1, channels: 3, users: 1, scheduled: 30, aiCredits: 20, storageMb: 200 });
    expect(s).toHaveLength(6);
    expect(s[0]).toEqual({ value: "1", label: "workspace" });
    expect(s[2]).toEqual({ value: "1", label: "team member" });
    expect(limitStats({ workspaces: 0, channels: 100, users: 30, scheduled: 1, aiCredits: 1, storageMb: 1 })[0]).toEqual({ value: "Unlimited", label: "workspaces" });
  });
});

describe("planHighlights", () => {
  it("drops bullets that repeat a limit and keeps what you actually get", () => {
    expect(planHighlights(["1 workspace", "3 channels", "Composer + calendar", "Basic analytics", "20 AI credits/mo"])).toEqual(["Composer + calendar", "Basic analytics"]);
    expect(planHighlights(["Unlimited workspaces", "100 channels", "Agency mode + client portals", "White-label reports", "API + webhooks", "10,000 AI credits/mo"])).toEqual([
      "Agency mode + client portals",
      "White-label reports",
      "API + webhooks",
    ]);
  });

  it("leaves every default plan with at least one highlight", () => {
    for (const p of PLAN_CATALOG) expect(planHighlights(p.features).length, p.key).toBeGreaterThan(0);
  });
});

describe("everyPlanItems", () => {
  const free = PLAN_CATALOG.find((p) => p.key === "free")!;
  it("collapses platforms into one line and lists real capabilities", () => {
    const items = everyPlanItems(free.entitlements);
    expect(items[0]).toMatch(/^Publish to 6 platforms: /);
    expect(items.join("|")).toContain("Scheduling");
    expect(items.join("|")).toContain("AI caption writer");
    expect(items.filter((i) => i.startsWith("Publish to"))).toHaveLength(1);
  });

  it("never invents a capability the plan does not have", () => {
    const items = everyPlanItems(["scheduling"]);
    expect(items).toEqual(["Scheduling"]);
    expect(everyPlanItems([])).toEqual([]);
  });
});

describe("misc", () => {
  it("computes annual savings and never goes negative", () => {
    expect(annualSaving(1800, 18000)).toBe(3600);
    expect(annualSaving(100, 5000)).toBe(0);
  });

  it("has a blurb for every default plan", () => {
    for (const p of PLAN_CATALOG) expect(PLAN_BLURB[p.key], p.key).toBeTruthy();
  });
});
