import { describe, it, expect } from "vitest";
import { ALL_ENTITLEMENTS } from "@/lib/constants";
import { ENTITLEMENT_INFO, settingInfo, type PlanSettingKey } from "./plan-info";

const SETTINGS: PlanSettingKey[] = [
  "priceMonthly", "priceAnnual", "priceMonthlyInr", "priceAnnualInr", "annualDiscountPct", "trialDays",
  "maxChannels", "maxWorkspaces", "maxUsers", "maxScheduled", "maxIdeas", "aiCredits", "storageMb",
  "analyticsRetentionDays", "apiRateLimit", "maxApiKeys", "automationLimit",
];

describe("plan setting help texts", () => {
  it("every setting has a short explanation", () => {
    for (const k of SETTINGS) {
      const t = settingInfo(k, { maxChannels: 3, maxScheduled: 10 });
      expect(t.length, k).toBeGreaterThan(20);
      expect(t.length, k).toBeLessThan(330);
    }
  });

  it("every feature switch in the admin has an explanation, and none is left over", () => {
    expect(ALL_ENTITLEMENTS.filter((k) => !ENTITLEMENT_INFO[k])).toEqual([]);
    expect(Object.keys(ENTITLEMENT_INFO).filter((k) => !ALL_ENTITLEMENTS.includes(k))).toEqual([]);
  });

  it("the scheduled-posts text gives Buffer's example with the numbers typed in the form", () => {
    expect(settingInfo("maxScheduled", { maxChannels: 3, maxScheduled: 10 })).toContain("With 3 connected channels and a limit of 10, a customer can schedule 30 posts (10 for each channel).");
    expect(settingInfo("maxScheduled", { maxChannels: 1, maxScheduled: 10 })).toContain("With 1 connected channel and a limit of 10, a customer can schedule 10 posts");
    expect(settingInfo("maxScheduled", { maxChannels: 3, maxScheduled: 0 })).toContain("unlimited");
  });
});
