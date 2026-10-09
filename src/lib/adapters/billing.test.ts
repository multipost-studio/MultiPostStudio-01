import { describe, it, expect, vi, beforeEach } from "vitest";
import { PLAN_CATALOG } from "@/lib/constants";

const m = vi.hoisted(() => ({
  flags: { realBilling: true, billingProvider: "razorpay" as "razorpay" | "stripe" | "stub" },
  isProduction: true,
  stripeSubs: { update: vi.fn(), retrieve: vi.fn() },
}));

vi.mock("@/lib/env", () => ({
  env: { STRIPE_SECRET_KEY: "sk_test_x" },
  get flags() {
    return m.flags;
  },
  get isProduction() {
    return m.isProduction;
  },
  appUrl: (p = "") => `https://app.test${p}`,
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/notifications/billing-notify", () => ({
  notifyPlanChanged: vi.fn().mockResolvedValue({ created: 1 }),
  notifySubscriptionCanceled: vi.fn().mockResolvedValue({ created: 1 }),
  notifyPaymentFailed: vi.fn().mockResolvedValue({ created: 1 }),
}));
vi.mock("@/lib/entitlements", () => ({ invalidateOrgPlan: vi.fn(), liveGauge: vi.fn().mockResolvedValue(0) }));
vi.mock("@/lib/plans", () => ({ getPlan: vi.fn() }));
vi.mock("@/lib/adapters/razorpay", () => ({
  createRazorpayPlan: vi.fn().mockResolvedValue({ id: "plan_rzp1" }),
  createRazorpaySubscription: vi.fn().mockResolvedValue({ id: "sub_NEWRZP" }),
  cancelRazorpaySubscription: vi.fn().mockResolvedValue({}),
  listRazorpayInvoices: vi.fn().mockResolvedValue([]),
}));
vi.mock("stripe", () => ({
  default: class {
    subscriptions = m.stripeSubs;
    coupons = { create: vi.fn() };
    customers = { createBalanceTransaction: vi.fn() };
    checkout = { sessions: { create: vi.fn().mockResolvedValue({ url: "https://stripe.test/pay" }) } };
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    plan: { findUnique: vi.fn() },
    subscription: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    organization: { findUnique: vi.fn(), update: vi.fn() },
    invoice: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({ id: "inv1" }), findFirst: vi.fn() },
    usageRecord: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { applyPlan, BillingError, cancelSubscription, markSubscriptionCanceled, reactivateSubscription, startCheckout } from "./billing";
import { db } from "@/lib/db";
import { getPlan } from "@/lib/plans";
import { logAudit } from "@/lib/events";
import { notifyPlanChanged, notifySubscriptionCanceled } from "@/lib/notifications/billing-notify";
import { createRazorpayPlan, createRazorpaySubscription, cancelRazorpaySubscription } from "@/lib/adapters/razorpay";

const row = (key: string) => {
  const p = PLAN_CATALOG.find((x) => x.key === key)!;
  return { ...p, id: `plan_${key}`, badge: null, features: [...p.features], entitlements: [...p.entitlements], sortIndex: 0 };
};
const DAY = 86_400_000;

beforeEach(() => {
  vi.clearAllMocks();
  m.flags.realBilling = true;
  m.flags.billingProvider = "razorpay";
  m.isProduction = true;
  vi.mocked(getPlan).mockImplementation(async (k) => row(k) as never);
  vi.mocked(db.plan.findUnique).mockImplementation((async ({ where }: { where: { key: string } }) => row(where.key)) as never);
  vi.mocked(db.subscription.findUnique).mockResolvedValue(null as never);
  vi.mocked(db.subscription.upsert).mockResolvedValue({ id: "sub_local", discountPct: 0 } as never);
  vi.mocked(db.organization.findUnique).mockResolvedValue({ creditBalance: 5000 } as never);
});

describe("starting a checkout", () => {
  it("never grants Enterprise: a zero price there means 'talk to us', not 'take it' (real billing)", async () => {
    await expect(startCheckout("org1", "a@b.co", "enterprise", "month", "usd")).rejects.toBeInstanceOf(BillingError);
    expect(db.subscription.upsert).not.toHaveBeenCalled();
    expect(createRazorpaySubscription).not.toHaveBeenCalled();
  });

  it("never grants Enterprise in the no-provider demo path either", async () => {
    m.flags.realBilling = false;
    await expect(startCheckout("org1", "a@b.co", "enterprise", "year", "usd")).rejects.toBeInstanceOf(BillingError);
  });

  it("refuses a hidden or custom plan and one an admin has zero-priced", async () => {
    vi.mocked(getPlan).mockResolvedValueOnce({ ...row("pro"), isPublic: false } as never);
    await expect(startCheckout("org1", "a@b.co", "pro", "month", "usd")).rejects.toBeInstanceOf(BillingError);
    vi.mocked(getPlan).mockResolvedValueOnce({ ...row("pro"), priceMonthly: 0, priceAnnual: 0, priceMonthlyInr: 0, priceAnnualInr: 0 } as never);
    await expect(startCheckout("org1", "a@b.co", "pro", "month", "usd")).rejects.toBeInstanceOf(BillingError);
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("a plan with no price in the chosen currency is refused, not applied for free", async () => {
    vi.mocked(getPlan).mockResolvedValueOnce({ ...row("pro"), priceMonthlyInr: 0 } as never);
    await expect(startCheckout("org1", "a@b.co", "pro", "month", "inr")).rejects.toThrow(/currency/);
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("charges the Plan row's price (an admin edit counts), in the chosen currency", async () => {
    vi.mocked(getPlan).mockResolvedValueOnce({ ...row("pro"), priceMonthlyInr: 199900 } as never);
    const url = await startCheckout("org1", "a@b.co", "pro", "month", "inr");
    expect(createRazorpayPlan).toHaveBeenCalledWith(expect.objectContaining({ amount: 199900, currency: "INR" }));
    expect(url).toContain("/settings/billing/checkout?sub=sub_NEWRZP");
  });

  it("applies a redeemed percent-off coupon to what Razorpay charges", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ discountPct: 20 } as never);
    await startCheckout("org1", "a@b.co", "pro", "month", "inr");
    expect(createRazorpayPlan).toHaveBeenCalledWith(expect.objectContaining({ amount: Math.round(row("pro").priceMonthlyInr * 0.8) }));
  });

  it("going back to Free stops the paid subscription at cycle end instead of switching instantly", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ provider: "razorpay", stripeSubscriptionId: "sub_PAID1" } as never);
    vi.mocked(db.subscription.update).mockResolvedValue({ id: "sub_local" } as never);
    await startCheckout("org1", "a@b.co", "free", "month", "usd", "user1");
    expect(cancelRazorpaySubscription).toHaveBeenCalledWith("sub_PAID1", true);
    expect(db.subscription.upsert).not.toHaveBeenCalled();
    expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "canceled" }) }));
  });
});

describe("applying a plan", () => {
  it("retires the previous provider subscription so the customer isn't billed twice", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ provider: "razorpay", stripeSubscriptionId: "sub_OLD1" } as never);
    await applyPlan("org1", "team", "month", undefined, { subscriptionId: "sub_NEW2", customerId: "cust_1" }, "razorpay");
    expect(cancelRazorpaySubscription).toHaveBeenCalledWith("sub_OLD1", true);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.previous_subscription_retired" }));
  });

  it("leaves it alone when the same subscription is re-applied (a webhook redelivery)", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ provider: "razorpay", stripeSubscriptionId: "sub_SAME" } as never);
    await applyPlan("org1", "pro", "month", undefined, { subscriptionId: "sub_SAME" }, "razorpay");
    expect(cancelRazorpaySubscription).not.toHaveBeenCalled();
  });

  it("retires an old Stripe subscription at period end", async () => {
    m.flags.billingProvider = "stripe";
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ provider: "stripe", stripeSubscriptionId: "sub_1OLD" } as never);
    await applyPlan("org1", "team", "year", undefined, { subscriptionId: "sub_2NEW" }, "stripe");
    expect(m.stripeSubs.update).toHaveBeenCalledWith("sub_1OLD", { cancel_at_period_end: true });
  });

  it("still gives the customer their plan when retiring the old subscription fails, and records it for follow-up", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ provider: "razorpay", stripeSubscriptionId: "sub_OLD1" } as never);
    vi.mocked(cancelRazorpaySubscription).mockRejectedValueOnce(new Error("provider down"));
    await expect(applyPlan("org1", "pro", "month", undefined, { subscriptionId: "sub_NEW2" }, "razorpay")).resolves.toBeTruthy();
    expect(db.subscription.upsert).toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.previous_subscription_retire_failed" }));
  });

  it("does not spend the customer's credit when a real provider is charging them", async () => {
    await applyPlan("org1", "pro", "month", undefined, { subscriptionId: "sub_NEW2" }, "razorpay");
    expect(db.organization.update).not.toHaveBeenCalled();
  });

  it("demo mode still uses credit and mirrors an invoice", async () => {
    m.flags.realBilling = false;
    m.flags.billingProvider = "stub";
    await applyPlan("org1", "pro", "month", undefined, undefined, "stub");
    expect(db.organization.update).toHaveBeenCalledWith(expect.objectContaining({ data: { creditBalance: { decrement: row("pro").priceMonthly } } }));
    expect(db.invoice.create).toHaveBeenCalled();
  });

  describe("tells the owners, but only when something changed", () => {
    it("a brand-new subscription", async () => {
      await applyPlan("org1", "pro", "month", undefined, { subscriptionId: "sub_NEW2" }, "razorpay");
      expect(notifyPlanChanged).toHaveBeenCalledWith("org1", expect.objectContaining({ planName: row("pro").name, interval: "month", isNew: true }));
    });

    it("a different plan or billing cycle", async () => {
      vi.mocked(db.subscription.findUnique).mockResolvedValue({ provider: "razorpay", stripeSubscriptionId: "sub_OLD1", planId: "plan_pro", interval: "month" } as never);
      await applyPlan("org1", "team", "month", undefined, { subscriptionId: "sub_NEW2" }, "razorpay");
      await applyPlan("org1", "pro", "year", undefined, { subscriptionId: "sub_NEW3" }, "razorpay");
      expect(notifyPlanChanged).toHaveBeenCalledTimes(2);
      expect(vi.mocked(notifyPlanChanged).mock.calls[0][1]).toMatchObject({ isNew: false });
    });

    it("not on a renewal or a redelivered webhook for the same plan", async () => {
      vi.mocked(db.subscription.findUnique).mockResolvedValue({ provider: "razorpay", stripeSubscriptionId: "sub_SAME", planId: "plan_pro", interval: "month" } as never);
      await applyPlan("org1", "pro", "month", undefined, { subscriptionId: "sub_SAME" }, "razorpay");
      expect(notifyPlanChanged).not.toHaveBeenCalled();
    });

    it("and a failing notification never undoes the activation", async () => {
      vi.mocked(notifyPlanChanged).mockRejectedValueOnce(new Error("boom"));
      await expect(applyPlan("org1", "pro", "month", undefined, { subscriptionId: "sub_NEW2" }, "razorpay")).resolves.toBeTruthy();
    });
  });

  it("throws for an unknown plan key", async () => {
    vi.mocked(db.plan.findUnique).mockResolvedValueOnce(null as never);
    await expect(applyPlan("org1", "nope" as never, "month")).rejects.toThrow(/Unknown plan/);
  });
});

describe("cancelling", () => {
  const live = { id: "sub_local", provider: "razorpay", stripeSubscriptionId: "sub_PAID1" };

  it("stops renewal at the provider (at cycle end) and then records it", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue(live as never);
    vi.mocked(db.subscription.update).mockResolvedValue({ id: "sub_local" } as never);
    await cancelSubscription("org1", "user1");
    expect(cancelRazorpaySubscription).toHaveBeenCalledWith("sub_PAID1", true);
    expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "canceled" }) }));
  });

  it("if the provider call fails nothing is marked cancelled: it must not say cancelled while still charging", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue(live as never);
    vi.mocked(cancelRazorpaySubscription).mockRejectedValueOnce(new Error("timeout"));
    await expect(cancelSubscription("org1", "user1")).rejects.toBeInstanceOf(BillingError);
    expect(db.subscription.update).not.toHaveBeenCalled();
  });

  it("a demo (stub) subscription is cancelled locally with no provider call", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ id: "s", provider: "stub", stripeSubscriptionId: "sub_stub_abc" } as never);
    vi.mocked(db.subscription.update).mockResolvedValue({ id: "s" } as never);
    await cancelSubscription("org1", "user1");
    expect(cancelRazorpaySubscription).not.toHaveBeenCalled();
    expect(db.subscription.update).toHaveBeenCalled();
  });

  it("recording a provider-side cancellation never calls the provider again, and can end access now", async () => {
    vi.mocked(db.subscription.update).mockResolvedValue({ id: "s" } as never);
    await markSubscriptionCanceled("org1", undefined, { endNow: true, source: "stripe" });
    expect(cancelRazorpaySubscription).not.toHaveBeenCalled();
    const data = vi.mocked(db.subscription.update).mock.calls[0][0].data as { currentPeriodEnd?: Date };
    expect(data.currentPeriodEnd).toBeInstanceOf(Date);
  });

  it("a cancellation from the provider is news for the owners; the customer's own click is not", async () => {
    vi.mocked(db.subscription.update).mockResolvedValue({ id: "s", currentPeriodEnd: new Date("2026-11-01T00:00:00Z") } as never);
    await markSubscriptionCanceled("org1", undefined, { source: "stripe" });
    expect(notifySubscriptionCanceled).toHaveBeenCalledWith("org1", { accessUntil: new Date("2026-11-01T00:00:00Z"), endedNow: false });
    vi.mocked(notifySubscriptionCanceled).mockClear();
    await markSubscriptionCanceled("org1", "user1");
    expect(notifySubscriptionCanceled).not.toHaveBeenCalled();
  });
});

describe("reactivating", () => {
  const sub = (over: object) => ({ id: "s", provider: "stripe", stripeSubscriptionId: "sub_1abc", status: "canceled", currentPeriodEnd: new Date(Date.now() + 5 * DAY), plan: { key: "pro" }, ...over });

  it("resumes a Stripe subscription only when Stripe says it is still alive", async () => {
    m.flags.billingProvider = "stripe";
    vi.mocked(db.subscription.findUnique).mockResolvedValue(sub({}) as never);
    m.stripeSubs.retrieve.mockResolvedValue({ status: "active" });
    vi.mocked(db.subscription.update).mockResolvedValue({ id: "s" } as never);
    await reactivateSubscription("org1", "user1");
    expect(m.stripeSubs.update).toHaveBeenCalledWith("sub_1abc", { cancel_at_period_end: false });
    expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "active", canceledAt: null } }));
  });

  it("an ended Stripe subscription cannot be resumed into a free plan: the customer must check out again", async () => {
    m.flags.billingProvider = "stripe";
    vi.mocked(db.subscription.findUnique).mockResolvedValue(sub({ currentPeriodEnd: new Date(Date.now() - DAY) }) as never);
    m.stripeSubs.retrieve.mockResolvedValue({ status: "canceled" });
    await expect(reactivateSubscription("org1", "user1")).rejects.toThrow(/already ended/);
    expect(db.subscription.update).not.toHaveBeenCalled();
  });

  it("Razorpay has no un-cancel, so it never flips the row back to active", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue(sub({ provider: "razorpay", stripeSubscriptionId: "sub_RZP1" }) as never);
    await expect(reactivateSubscription("org1", "user1")).rejects.toBeInstanceOf(BillingError);
    expect(db.subscription.update).not.toHaveBeenCalled();
  });

  it("a provider outage changes nothing", async () => {
    m.flags.billingProvider = "stripe";
    vi.mocked(db.subscription.findUnique).mockResolvedValue(sub({}) as never);
    m.stripeSubs.retrieve.mockRejectedValue(new Error("network"));
    await expect(reactivateSubscription("org1", "user1")).rejects.toBeInstanceOf(BillingError);
    expect(db.subscription.update).not.toHaveBeenCalled();
  });

  it("production never resumes a row that has no real subscription behind it", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue(sub({ provider: "stub", stripeSubscriptionId: "sub_stub_x" }) as never);
    await expect(reactivateSubscription("org1", "user1")).rejects.toBeInstanceOf(BillingError);
    expect(db.subscription.update).not.toHaveBeenCalled();
  });

  it("demo mode can resume while paid time is left, but not after it has run out", async () => {
    m.flags.realBilling = false;
    m.isProduction = false;
    vi.mocked(db.subscription.update).mockResolvedValue({ id: "s" } as never);
    vi.mocked(db.subscription.findUnique).mockResolvedValueOnce(sub({ provider: "stub", stripeSubscriptionId: "sub_stub_x" }) as never);
    await expect(reactivateSubscription("org1", "user1")).resolves.toBeTruthy();
    vi.mocked(db.subscription.findUnique).mockResolvedValueOnce(sub({ provider: "stub", stripeSubscriptionId: "sub_stub_x", currentPeriodEnd: new Date(Date.now() - DAY) }) as never);
    await expect(reactivateSubscription("org1", "user1")).rejects.toBeInstanceOf(BillingError);
  });

  it("returns null when there is no subscription at all", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue(null as never);
    expect(await reactivateSubscription("org1", "user1")).toBeNull();
  });
});
