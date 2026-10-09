import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/settings", () => ({ writeSettings: vi.fn() }));
vi.mock("@/lib/plans", () => ({ invalidatePlans: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ invalidateFeatureFlags: vi.fn() }));
vi.mock("@/lib/cms", () => ({ invalidateCms: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ invalidateOrgPlan: vi.fn() }));
vi.mock("@/lib/adapters/billing", () => ({ applyPlan: vi.fn() }));
vi.mock("@/lib/session", () => {
  // one function for both guards: the actions now ask for a named permission, the tests only care whether the caller is an admin
  const guard = vi.fn(async () => ({ id: "admin1" }));
  return { requirePlatformAdmin: guard, requireAdminPermission: guard };
});
vi.mock("@/lib/db", () => ({ db: { featureFlag: { findUnique: vi.fn(), update: vi.fn() } } }));

import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { invalidateFeatureFlags } from "@/lib/feature-flags";
import { setFlagRolloutAction, toggleFeatureFlagAction } from "./admin";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.featureFlag.findUnique).mockResolvedValue({ key: "ai_agent", enabled: true, rollout: 100 } as never);
  vi.mocked(db.featureFlag.update).mockResolvedValue({} as never);
});

describe("feature flags are audited kill switches", () => {
  it("records who flipped a flag, which one, and from/to", async () => {
    const r = await toggleFeatureFlagAction("f1", false);
    expect(r).toEqual({ ok: true });
    expect(db.featureFlag.update).toHaveBeenCalledWith({ where: { id: "f1" }, data: { enabled: false } });
    expect(vi.mocked(logAudit).mock.calls[0][0]).toMatchObject({ actorId: "admin1", action: "admin.flag_toggled", targetId: "f1", metadata: { key: "ai_agent", from: true, to: false } });
    expect(invalidateFeatureFlags).toHaveBeenCalled();
  });

  it("refuses an unknown flag and bad input without changing anything", async () => {
    vi.mocked(db.featureFlag.findUnique).mockResolvedValue(null as never);
    expect((await toggleFeatureFlagAction("nope", true)).ok).toBe(false);
    expect((await toggleFeatureFlagAction("", true)).ok).toBe(false);
    expect((await toggleFeatureFlagAction("f1", "yes" as never)).ok).toBe(false);
    expect(db.featureFlag.update).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it("clamps and rounds a rollout percentage, and audits the change", async () => {
    await setFlagRolloutAction("f1", 150);
    await setFlagRolloutAction("f1", 33.6);
    await setFlagRolloutAction("f1", -5);
    expect(vi.mocked(db.featureFlag.update).mock.calls.map((c) => (c[0].data as { rollout: number }).rollout)).toEqual([100, 34, 0]);
    expect(vi.mocked(logAudit).mock.calls[1][0]).toMatchObject({ action: "admin.flag_rollout_changed", metadata: { key: "ai_agent", from: 100, to: 34 } });
  });

  it("rejects a rollout that is not a real number instead of writing NaN", async () => {
    for (const bad of [NaN, Infinity, "50" as never, undefined as never]) {
      expect((await setFlagRolloutAction("f1", bad)).ok).toBe(false);
    }
    expect(db.featureFlag.update).not.toHaveBeenCalled();
  });

  it("a failing audit write never blocks the switch", async () => {
    vi.mocked(logAudit).mockRejectedValueOnce(new Error("audit down"));
    expect(await toggleFeatureFlagAction("f1", false)).toEqual({ ok: true });
  });
});
