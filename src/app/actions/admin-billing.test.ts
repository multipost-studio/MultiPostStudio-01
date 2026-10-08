import { describe, it, expect, vi, beforeEach } from "vitest";
import { adminSetOrgPlanAction, setSubscriptionStatusAction, updatePlanAction } from "./admin";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/session";
import { applyPlan } from "@/lib/adapters/billing";
import { logAudit } from "@/lib/events";
import { invalidateOrgPlan } from "@/lib/entitlements";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/settings", () => ({ writeSettings: vi.fn() }));
vi.mock("@/lib/plans", () => ({ invalidatePlans: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ invalidateFeatureFlags: vi.fn() }));
vi.mock("@/lib/cms", () => ({ invalidateCms: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ invalidateOrgPlan: vi.fn() }));
vi.mock("@/lib/adapters/billing", () => ({ applyPlan: vi.fn() }));
vi.mock("@/lib/session", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    plan: { findUnique: vi.fn(), update: vi.fn() },
    subscription: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

const ADMIN = { id: "admin_1" };
const DAY = 86_400_000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformAdmin).mockResolvedValue(ADMIN as never);
});

describe("admin: assigning a plan by hand", () => {
  it("won't overwrite an org that is billed through a live provider subscription (it would be orphaned and keep charging)", async () => {
    vi.mocked(db.plan.findUnique).mockResolvedValue({ key: "team" } as never);
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ provider: "razorpay", stripeSubscriptionId: "sub_LIVE1" } as never);
    const res = await adminSetOrgPlanAction("org1", "team", "month");
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/razorpay/);
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("does assign a plan to an org with no real subscription, including a custom plan an admin created", async () => {
    vi.mocked(db.plan.findUnique).mockResolvedValue({ key: "custom-acme" } as never);
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ provider: "stub", stripeSubscriptionId: "sub_stub_abc" } as never);
    const res = await adminSetOrgPlanAction("org1", "custom-acme", "year");
    expect(res.ok).toBe(true);
    expect(applyPlan).toHaveBeenCalledWith("org1", "custom-acme", "year", ADMIN.id, undefined, "stub");
  });

  it("rejects a plan that doesn't exist", async () => {
    vi.mocked(db.plan.findUnique).mockResolvedValue(null as never);
    expect((await adminSetOrgPlanAction("org1", "ghost", "month")).ok).toBe(false);
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("is admin only", async () => {
    vi.mocked(requirePlatformAdmin).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(adminSetOrgPlanAction("org1", "team", "month")).rejects.toThrow();
    expect(applyPlan).not.toHaveBeenCalled();
  });
});

describe("admin: overriding a subscription's status", () => {
  it("records what it was and what it became, and refreshes the plan cache so the change shows now", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ status: "canceled", currentPeriodEnd: new Date(Date.now() + DAY), provider: "stripe" } as never);
    await setSubscriptionStatusAction("org1", "active");
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.subscription_status", metadata: expect.objectContaining({ from: "canceled", to: "active" }) }));
    expect(invalidateOrgPlan).toHaveBeenCalledWith("org1");
  });

  it("gives a manual activation real time, because an 'active' row whose period ended would stay entitled forever", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ status: "canceled", currentPeriodEnd: new Date(Date.now() - 5 * DAY), provider: "stripe" } as never);
    await setSubscriptionStatusAction("org1", "active");
    const data = vi.mocked(db.subscription.update).mock.calls[0][0].data as { currentPeriodEnd?: Date };
    expect(data.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 25 * DAY);
  });

  it("leaves the period alone when there is still paid time, and when cancelling", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ status: "active", currentPeriodEnd: new Date(Date.now() + 9 * DAY), provider: "stripe" } as never);
    await setSubscriptionStatusAction("org1", "canceled");
    const data = vi.mocked(db.subscription.update).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.currentPeriodEnd).toBeUndefined();
    expect(data.canceledAt).toBeInstanceOf(Date);
  });

  it("refuses when the org has no subscription", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue(null as never);
    expect((await setSubscriptionStatusAction("org1", "active")).ok).toBe(false);
    expect(db.subscription.update).not.toHaveBeenCalled();
  });
});

describe("admin: editing a plan", () => {
  it("audits exactly what changed (from and to) and how many customers are on the plan", async () => {
    vi.mocked(db.plan.findUnique).mockResolvedValue({ id: "p1", key: "pro", maxScheduled: 2000, aiCredits: 500, _count: { subscriptions: 42 } } as never);
    await updatePlanAction("p1", { maxScheduled: 1000, aiCredits: 500 });
    const call = vi.mocked(logAudit).mock.calls[0][0];
    expect(call.action).toBe("admin.plan_updated");
    expect(call.metadata).toMatchObject({ key: "pro", customersOnPlan: 42, changed: { maxScheduled: { from: 2000, to: 1000 } } });
    // an unchanged field is not reported as a change
    expect((call.metadata as { changed: object }).changed).not.toHaveProperty("aiCredits");
  });

  it("refuses an unknown plan and clamps negatives to zero", async () => {
    vi.mocked(db.plan.findUnique).mockResolvedValue(null as never);
    expect((await updatePlanAction("ghost", { maxUsers: 5 })).ok).toBe(false);
    expect(db.plan.update).not.toHaveBeenCalled();
    vi.mocked(db.plan.findUnique).mockResolvedValue({ id: "p1", key: "pro", maxUsers: 2, _count: { subscriptions: 0 } } as never);
    await updatePlanAction("p1", { maxUsers: -50 });
    expect(vi.mocked(db.plan.update).mock.calls[0][0].data).toMatchObject({ maxUsers: 0 });
  });

  it("is admin only", async () => {
    vi.mocked(requirePlatformAdmin).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(updatePlanAction("p1", { maxUsers: 5 })).rejects.toThrow();
    expect(db.plan.update).not.toHaveBeenCalled();
  });
});
