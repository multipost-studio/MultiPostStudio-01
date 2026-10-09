import { describe, it, expect, vi, beforeEach } from "vitest";
import { adjustOrgCreditsAction, adminSetOrgPlanAction, setInvoiceStatusAction, setSubscriptionStatusAction, updatePlanAction } from "./admin";
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
vi.mock("@/lib/session", () => {
  // one function for both guards: the actions now ask for a named permission, the tests only care whether the caller is an admin
  const guard = vi.fn();
  return { requirePlatformAdmin: guard, requireAdminPermission: guard };
});
vi.mock("@/lib/db", () => ({
  db: {
    plan: { findUnique: vi.fn(), update: vi.fn() },
    subscription: { findUnique: vi.fn(), update: vi.fn() },
    invoice: { findUnique: vi.fn(), update: vi.fn() },
    organization: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

const ADMIN = { id: "admin_1" };
const REASON = "Customer paid by bank transfer";
const DAY = 86_400_000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformAdmin).mockResolvedValue(ADMIN as never);
});

describe("admin: assigning a plan by hand", () => {
  it("won't overwrite an org that is billed through a live provider subscription (it would be orphaned and keep charging)", async () => {
    vi.mocked(db.plan.findUnique).mockResolvedValue({ key: "team" } as never);
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ provider: "razorpay", stripeSubscriptionId: "sub_LIVE1" } as never);
    const res = await adminSetOrgPlanAction("org1", "team", "month", REASON);
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/razorpay/);
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("does assign a plan to an org with no real subscription, including a custom plan an admin created", async () => {
    vi.mocked(db.plan.findUnique).mockResolvedValue({ key: "custom-acme" } as never);
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ provider: "stub", stripeSubscriptionId: "sub_stub_abc" } as never);
    const res = await adminSetOrgPlanAction("org1", "custom-acme", "year", REASON);
    expect(res.ok).toBe(true);
    expect(applyPlan).toHaveBeenCalledWith("org1", "custom-acme", "year", ADMIN.id, undefined, "stub");
  });

  it("rejects a plan that doesn't exist", async () => {
    vi.mocked(db.plan.findUnique).mockResolvedValue(null as never);
    expect((await adminSetOrgPlanAction("org1", "ghost", "month", REASON)).ok).toBe(false);
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("is admin only", async () => {
    vi.mocked(requirePlatformAdmin).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(adminSetOrgPlanAction("org1", "team", "month", REASON)).rejects.toThrow();
    expect(applyPlan).not.toHaveBeenCalled();
  });
});

describe("admin: overriding a subscription's status", () => {
  it("records what it was and what it became, and refreshes the plan cache so the change shows now", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ status: "canceled", currentPeriodEnd: new Date(Date.now() + DAY), provider: "stripe" } as never);
    await setSubscriptionStatusAction("org1", "active", REASON);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.subscription_status", metadata: expect.objectContaining({ from: "canceled", to: "active" }) }));
    expect(invalidateOrgPlan).toHaveBeenCalledWith("org1");
  });

  it("gives a manual activation real time, because an 'active' row whose period ended would stay entitled forever", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ status: "canceled", currentPeriodEnd: new Date(Date.now() - 5 * DAY), provider: "stripe" } as never);
    await setSubscriptionStatusAction("org1", "active", REASON);
    const data = vi.mocked(db.subscription.update).mock.calls[0][0].data as { currentPeriodEnd?: Date };
    expect(data.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 25 * DAY);
  });

  it("leaves the period alone when there is still paid time, and when cancelling", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ status: "active", currentPeriodEnd: new Date(Date.now() + 9 * DAY), provider: "stripe" } as never);
    await setSubscriptionStatusAction("org1", "canceled", REASON);
    const data = vi.mocked(db.subscription.update).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.currentPeriodEnd).toBeUndefined();
    expect(data.canceledAt).toBeInstanceOf(Date);
  });

  it("refuses when the org has no subscription", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue(null as never);
    expect((await setSubscriptionStatusAction("org1", "active", REASON)).ok).toBe(false);
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

describe("admin: money overrides need a written reason", () => {
  it("refuses a plan override, a subscription status change and an invoice status change without one, and touches nothing", async () => {
    for (const bad of ["", "   ", "short", undefined as unknown as string]) {
      expect((await adminSetOrgPlanAction("org1", "team", "month", bad)).ok).toBe(false);
      expect((await setSubscriptionStatusAction("org1", "active", bad)).ok).toBe(false);
      expect((await setInvoiceStatusAction("inv1", "paid", bad)).ok).toBe(false);
      expect((await adjustOrgCreditsAction("org1", 10, bad)).ok).toBe(false);
    }
    expect(applyPlan).not.toHaveBeenCalled();
    expect(db.subscription.update).not.toHaveBeenCalled();
    expect(db.invoice.update).not.toHaveBeenCalled();
    expect(db.organization.update).not.toHaveBeenCalled();
  });

  it("records the reason on a plan override, a subscription change and an invoice change", async () => {
    vi.mocked(db.plan.findUnique).mockResolvedValue({ key: "team" } as never);
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ provider: "stub", stripeSubscriptionId: "sub_stub_1", status: "canceled", currentPeriodEnd: new Date(Date.now() + DAY) } as never);
    vi.mocked(db.invoice.findUnique).mockResolvedValue({ status: "open" } as never);
    vi.mocked(db.invoice.update).mockResolvedValue({ orgId: "org1" } as never);
    await adminSetOrgPlanAction("org1", "team", "month", REASON);
    await setSubscriptionStatusAction("org1", "active", REASON);
    await setInvoiceStatusAction("inv1", "paid", REASON);
    const logged = vi.mocked(logAudit).mock.calls.map((c) => [c[0].action, (c[0].metadata as { reason?: string }).reason]);
    expect(logged).toEqual([
      ["admin.org_plan_set", REASON],
      ["admin.subscription_status", REASON],
      ["admin.invoice_status", REASON],
    ]);
    expect(vi.mocked(logAudit).mock.calls[2][0].metadata).toMatchObject({ from: "open", status: "paid" });
  });

  it("an unknown invoice or status is refused, not written", async () => {
    vi.mocked(db.invoice.findUnique).mockResolvedValue(null as never);
    expect((await setInvoiceStatusAction("ghost", "paid", REASON)).ok).toBe(false);
    expect((await setInvoiceStatusAction("inv1", "refunded" as never, REASON)).ok).toBe(false);
    expect(db.invoice.update).not.toHaveBeenCalled();
  });
});
