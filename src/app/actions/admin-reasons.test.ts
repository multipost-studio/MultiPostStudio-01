import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/settings", () => ({ writeSettings: vi.fn() }));
vi.mock("@/lib/plans", () => ({ invalidatePlans: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ invalidateFeatureFlags: vi.fn() }));
vi.mock("@/lib/cms", () => ({ invalidateCms: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ invalidateOrgPlan: vi.fn() }));
vi.mock("@/lib/adapters/billing", () => ({ applyPlan: vi.fn() }));
vi.mock("@/lib/session", () => {
  const guard = vi.fn(async () => ({ id: "admin1", isPlatformAdmin: true, platformRole: null }));
  return { requirePlatformAdmin: guard, requireAdminPermission: guard };
});
// Any touch of the database fails the test: a refused action must not read or write anything.
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, { get: (_t, model) => { throw new Error(`db.${String(model)} touched before the reason was checked`); } }),
}));

import { logAudit } from "@/lib/events";
import * as actions from "./admin";

type Call = [name: keyof typeof actions, args: unknown[]];
/** Every sensitive action, with valid arguments up to (not including) the reason. */
const CASES: Call[] = [
  ["toggleFeatureFlagAction", ["f1", true]],
  ["setFlagRolloutAction", ["f1", 50]],
  ["updatePlanAction", ["p1", { maxUsers: 5 }]],
  ["createPlanAction", [{ key: "x", name: "X" }]],
  ["deletePlanAction", ["p1"]],
  ["seedDefaultPlansAction", []],
  ["updateSiteSettingsAction", [{}]],
  ["setUserAdminAction", ["u2", true]],
  ["setUserPlatformRoleAction", ["u2", "support"]],
  ["setUserSuspendedAction", ["u2", true]],
  ["forceVerifyUserAction", ["u2"]],
  ["deleteUserAction", ["u2"]],
  ["restoreUserAction", ["u2"]],
  ["unlockUserTotpAction", ["u2", false]],
  ["clearAllTotpLockoutsAction", []],
  ["revokeUserDeviceAction", ["u2", "d1"]],
  ["setOrgSuspendedAction", ["o1", true]],
  ["deleteOrgAction", ["o1"]],
  ["restoreOrgAction", ["o1"]],
  ["updateOrgDetailsAction", ["o1", { name: "Acme" }]],
  ["adminArchivePostAction", ["post1", true]],
  ["adminDisconnectSocialAction", ["s1"]],
  ["revokeApiKeyAction", ["k1"]],
  ["setWebhookActiveAction", ["w1", false]],
  ["createCouponAction", [{ code: "SAVE10", description: "x" }]],
  ["setCouponActiveAction", ["c1", false]],
  ["deleteCouponAction", ["c1"]],
  ["adjustOrgCreditsAction", ["o1", 10]],
  ["adminSetOrgPlanAction", ["o1", "team", "month"]],
  ["setInvoiceStatusAction", ["i1", "paid"]],
  ["setSubscriptionStatusAction", ["o1", "active"]],
];

beforeEach(() => vi.clearAllMocks());

describe("sensitive admin actions need a written reason", () => {
  it("covers every case we list", () => {
    for (const [name] of CASES) expect(typeof actions[name], String(name)).toBe("function");
  });

  for (const [name, args] of CASES) {
    it(`${String(name)} refuses a missing, empty or too-short reason and touches nothing`, async () => {
      const fn = actions[name] as unknown as (...a: unknown[]) => Promise<{ ok: boolean; error?: string }>;
      for (const bad of [undefined, "", "   ", "short"]) {
        const res = await fn(...args, bad);
        expect(res.ok, `${String(name)} with ${JSON.stringify(bad)}`).toBe(false);
        expect(res.error).toMatch(/reason/i);
      }
      expect(logAudit).not.toHaveBeenCalled();
    });
  }
});
