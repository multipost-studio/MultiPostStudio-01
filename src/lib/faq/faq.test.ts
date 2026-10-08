import { describe, it, expect } from "vitest";
import { ALL_FAQS, FAQ_GROUPS, PAGE_FAQS } from "./data";
import { buildPricingFaqs } from "./plans";
import type { PlanRow } from "@/lib/plans";
import { PLAN_CATALOG } from "@/lib/constants";

const plans: PlanRow[] = PLAN_CATALOG.map((p, i) => ({ ...p, id: p.key, badge: p.badge ?? null, features: [...p.features], entitlements: [...p.entitlements], sortIndex: i }));

describe("FAQ content", () => {
  it("has a question and a real answer everywhere, with no duplicate questions inside a set", () => {
    const sets: [string, { q: string; a: string }[]][] = [...FAQ_GROUPS.map((g) => [g.id, g.items] as [string, { q: string; a: string }[]]), ...Object.entries(PAGE_FAQS)];
    for (const [name, items] of sets) {
      expect(items.length, name).toBeGreaterThan(0);
      const seen = new Set<string>();
      for (const { q, a } of items) {
        expect(q.trim().length, `${name}: question`).toBeGreaterThan(8);
        expect(q.trim().endsWith("?") || q.trim().endsWith("."), `${name}: "${q}" ends like a sentence`).toBe(true);
        expect(a.trim().length, `${name}: "${q}" answer`).toBeGreaterThan(30);
        expect(seen.has(q), `${name}: duplicate "${q}"`).toBe(false);
        seen.add(q);
      }
    }
  });

  it("never hard-codes a price or a plan limit that /admin/plans controls", () => {
    for (const { q, a } of ALL_FAQS) {
      expect(a, q).not.toMatch(/[$€£₹]\s?\d/);
      expect(a, q).not.toMatch(/\b\d[\d,]*\s*(AI credits|channels|workspaces|seats)\b/i);
    }
  });

  it("only borrows questions that exist (a renamed question must not silently drop from a page)", () => {
    expect(PAGE_FAQS.landing.length).toBeGreaterThanOrEqual(7);
    expect(PAGE_FAQS.security.length).toBeGreaterThanOrEqual(7);
    expect(PAGE_FAQS.help.length).toBeGreaterThanOrEqual(6);
  });

  it("is honest about SSO: it never says SSO or SCIM is simply available", () => {
    const sso = ALL_FAQS.find((f) => f.q.includes("single sign-on"));
    expect(sso?.a).toMatch(/ask us|scope/i);
    for (const { a } of Object.values(PAGE_FAQS).flat()) expect(a).not.toMatch(/include[s]? SSO/i);
  });
});

describe("pricing FAQs built from the live plans", () => {
  const faqs = buildPricingFaqs(plans, { inrEnabled: false });
  const answer = (q: RegExp) => faqs.find((f) => q.test(f.q))?.a ?? "";

  it("describes the free plan from its real limits", () => {
    const a = answer(/free plan/i);
    expect(a).toContain("1 workspace");
    expect(a).toContain("3 channels");
    expect(a).toContain("20 AI credits");
  });

  it("changes when an admin changes a plan", () => {
    const edited = plans.map((p) => (p.key === "free" ? { ...p, maxChannels: 5, aiCredits: 50 } : p));
    const a = buildPricingFaqs(edited, { inrEnabled: false }).find((f) => /free plan/i.test(f.q))!.a;
    expect(a).toContain("5 channels");
    expect(a).toContain("50 AI credits");
  });

  it("states each trial length, and says so plainly when there are no trials", () => {
    expect(answer(/trial/i)).toMatch(/Pro starts with a 14-day trial/);
    const none = buildPricingFaqs(plans.map((p) => ({ ...p, trialDays: 0 })), { inrEnabled: false }).find((f) => /trial/i.test(f.q))!.a;
    expect(none).toMatch(/free plan is the way to try it/i);
  });

  it("lists which networks start on which plan", () => {
    const a = answer(/which social networks/i);
    expect(a).toMatch(/Free covers .*Instagram/);
    expect(a).toMatch(/YouTube/);
  });

  it("only mentions rupees when INR billing is on", () => {
    expect(answer(/currency/i)).toMatch(/US dollars/);
    expect(answer(/currency/i)).not.toMatch(/rupee/i);
    const inr = buildPricingFaqs(plans, { inrEnabled: true }).find((f) => /currency/i.test(f.q))!.a;
    expect(inr).toMatch(/rupees/i);
  });

  it("works with no plans at all, and never prints undefined or NaN", () => {
    for (const set of [buildPricingFaqs([], { inrEnabled: false }), faqs]) {
      for (const { q, a } of set) expect(`${q} ${a}`).not.toMatch(/undefined|NaN|null/);
    }
    expect(buildPricingFaqs([], { inrEnabled: false }).length).toBeGreaterThan(3);
  });

  it("explains the annual discount from the plan data", () => {
    expect(answer(/annual/i)).toMatch(/about 17%/);
    expect(answer(/annual/i)).toMatch(/2 months free/);
  });
});
