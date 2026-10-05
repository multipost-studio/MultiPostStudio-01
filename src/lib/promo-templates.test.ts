import { describe, it, expect } from "vitest";
import { NAV, SETTINGS_NAV } from "@/lib/nav";
import { PLAN_CATALOG } from "@/lib/constants";
import { promoCardSchema } from "./promo-cards";
import { KNOWN_ENTITLEMENTS, PROMO_TEMPLATES, STARTER_TEMPLATES, templateAudienceNote, templateTargetPlans, templateToInput } from "./promo-templates";

const REAL_PATHS = new Set([...NAV.flatMap((g) => g.items.map((i) => i.href)), ...SETTINGS_NAV.map((i) => i.href), "/settings/billing"]);
const pathOf = (url: string) => url.split("?")[0];

describe("promo templates", () => {
  it("have unique ids", () => {
    const ids = PROMO_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(PROMO_TEMPLATES.map((t) => [t.id, t] as const))("%s links to a page that exists in the app", (_id, t) => {
    expect(REAL_PATHS.has(pathOf(t.ctaUrl)), `${t.ctaUrl} is not a real nav/settings route`).toBe(true);
  });

  it.each(PROMO_TEMPLATES.map((t) => [t.id, t] as const))("%s passes the same validation an admin's card does", (_id, t) => {
    const r = promoCardSchema.safeParse(templateToInput(t));
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
  });

  it("only references entitlements that exist", () => {
    for (const t of PROMO_TEMPLATES) {
      for (const e of [t.forPlansWith, t.forPlansWithout]) if (e) expect(KNOWN_ENTITLEMENTS.has(e), `${t.id}: ${e}`).toBe(true);
    }
  });

  it("never ship published", () => {
    expect(PROMO_TEMPLATES.every((t) => templateToInput(t).enabled === false)).toBe(true);
  });

  it("target everyone or a strict subset of plans", () => {
    for (const t of PROMO_TEMPLATES) {
      const plans = templateTargetPlans(t);
      // Either "everyone" ([]) or a strict subset of plans — never an explicit list of all of them.
      expect(plans.length, `${t.id} lists every plan explicitly`).toBeLessThan(PLAN_CATALOG.length);
      if (!t.forPlansWith && !t.forPlansWithout) expect(plans).toEqual([]);
    }
  });

  it("upgrade prompts are never aimed at a plan that already has the feature", () => {
    const unlock = PROMO_TEMPLATES.find((t) => t.id === "unlock-automations")!;
    const plans = templateTargetPlans(unlock);
    expect(plans).toContain("free");
    expect(plans).not.toContain("pro"); // Pro already includes automations
  });

  it("gates the affiliate card behind the affiliate setting", () => {
    expect(PROMO_TEMPLATES.find((t) => t.id === "affiliate")?.requiresSetting).toBe("affiliateEnabled");
    expect(STARTER_TEMPLATES.some((t) => t.id === "affiliate")).toBe(false);
  });

  it("has a starter set that never makes a promise the product might not keep", () => {
    expect(STARTER_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    expect(STARTER_TEMPLATES.every((t) => !t.requiresSetting)).toBe(true);
  });

  it("describes the audience for the picker", () => {
    expect(templateAudienceNote(PROMO_TEMPLATES.find((t) => t.id === "upgrade-pro")!)).toMatch(/^Shown to: Free/);
    expect(templateAudienceNote(PROMO_TEMPLATES.find((t) => t.id === "connect-platform")!)).toBe("Shown to every plan");
  });
});
