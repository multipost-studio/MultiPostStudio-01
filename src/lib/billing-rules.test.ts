import { describe, it, expect } from "vitest";
import { PLAN_CATALOG } from "./constants";
import { clampPct, describeSubscription, discounted, isSelfServePlan, localFromStripe, planAmount, razorpayGrantsAccess, retirablePreviousSubscription } from "./billing-rules";

const catalog = (key: string) => PLAN_CATALOG.find((p) => p.key === key)!;
const DAY = 86_400_000;
const future = (d: number) => new Date(Date.now() + d * DAY);
const past = (d: number) => new Date(Date.now() - d * DAY);

describe("who may self-serve which plan", () => {
  it("allows Free and every public paid plan", () => {
    for (const key of ["free", "pro", "team", "agency"]) expect(isSelfServePlan(catalog(key)), key).toBe(true);
  });

  it("never lets a zero-priced non-Free plan be granted: Enterprise is sales-led", () => {
    expect(catalog("enterprise").priceMonthly).toBe(0);
    expect(isSelfServePlan(catalog("enterprise"))).toBe(false);
  });

  it("refuses hidden, custom and unknown plans", () => {
    expect(isSelfServePlan({ ...catalog("pro"), isPublic: false })).toBe(false);
    expect(isSelfServePlan({ ...catalog("pro"), isCustom: true })).toBe(false);
    expect(isSelfServePlan(null)).toBe(false);
    expect(isSelfServePlan(undefined)).toBe(false);
  });

  it("a paid plan an admin zeroed out is no longer self-serve (it would be a free upgrade)", () => {
    expect(isSelfServePlan({ ...catalog("pro"), priceMonthly: 0, priceAnnual: 0, priceMonthlyInr: 0, priceAnnualInr: 0 })).toBe(false);
  });
});

describe("amounts", () => {
  it("picks the price for the interval and currency, never a converted one", () => {
    const pro = catalog("pro");
    expect(planAmount(pro, "month", "usd")).toBe(pro.priceMonthly);
    expect(planAmount(pro, "year", "usd")).toBe(pro.priceAnnual);
    expect(planAmount(pro, "month", "inr")).toBe(pro.priceMonthlyInr);
    expect(planAmount(pro, "year", "inr")).toBe(pro.priceAnnualInr);
  });

  it("applies a discount safely", () => {
    expect(discounted(10000, 20)).toBe(8000);
    expect(discounted(10000, 0)).toBe(10000);
    expect(discounted(10000, 150)).toBe(0);
    expect(discounted(10000, -5)).toBe(10000);
    expect(discounted(999, 33)).toBe(669);
    expect(clampPct(null)).toBe(0);
  });
});

describe("Stripe status mapping", () => {
  it("treats cancel-at-period-end as canceled (access continues to period end), not active", () => {
    expect(localFromStripe({ status: "active", cancelAtPeriodEnd: true })).toEqual({ status: "canceled", canceled: true });
    expect(localFromStripe({ status: "trialing", cancelAtPeriodEnd: true })).toEqual({ status: "canceled", canceled: true });
  });

  it("keeps ordinary states as they are", () => {
    expect(localFromStripe({ status: "active" })).toEqual({ status: "active", canceled: false });
    expect(localFromStripe({ status: "past_due", cancelAtPeriodEnd: false })).toEqual({ status: "past_due", canceled: false });
    expect(localFromStripe({ status: "unpaid" })).toEqual({ status: "unpaid", canceled: false });
    expect(localFromStripe({ status: "canceled" })).toEqual({ status: "canceled", canceled: true });
  });
});

describe("Razorpay: when has the customer really paid", () => {
  it("accepts active and completed", () => {
    expect(razorpayGrantsAccess({ status: "active" })).toBe(true);
    expect(razorpayGrantsAccess({ status: "completed" })).toBe(true);
  });

  it("accepts authenticated only after a charge has gone through", () => {
    expect(razorpayGrantsAccess({ status: "authenticated", paid_count: 0 })).toBe(false);
    expect(razorpayGrantsAccess({ status: "authenticated" })).toBe(false);
    expect(razorpayGrantsAccess({ status: "authenticated", paid_count: 1 })).toBe(true);
  });

  it("refuses everything else", () => {
    for (const status of ["created", "pending", "halted", "cancelled", "paused", "expired"]) expect(razorpayGrantsAccess({ status, paid_count: 3 }), status).toBe(false);
  });
});

describe("retiring the previous provider subscription", () => {
  const old = { provider: "razorpay", stripeSubscriptionId: "sub_OLD123" };

  it("retires the old one when a different real subscription replaces it", () => {
    expect(retirablePreviousSubscription(old, "sub_NEW456")).toEqual({ provider: "razorpay", id: "sub_OLD123" });
    expect(retirablePreviousSubscription({ provider: "stripe", stripeSubscriptionId: "sub_1abc" }, "sub_2def")).toEqual({ provider: "stripe", id: "sub_1abc" });
  });

  it("does nothing for the same subscription (webhook redelivery), demo ids or no previous one", () => {
    expect(retirablePreviousSubscription(old, "sub_OLD123")).toBeNull();
    expect(retirablePreviousSubscription({ provider: "stub", stripeSubscriptionId: "sub_stub_abc" }, "sub_NEW456")).toBeNull();
    expect(retirablePreviousSubscription({ provider: "razorpay", stripeSubscriptionId: "sub_stub_abc" }, "sub_NEW456")).toBeNull();
    expect(retirablePreviousSubscription(old, "sub_stub_zzz")).toBeNull();
    expect(retirablePreviousSubscription(old, undefined)).toBeNull();
    expect(retirablePreviousSubscription(null, "sub_NEW456")).toBeNull();
    expect(retirablePreviousSubscription({ provider: "razorpay", stripeSubscriptionId: null }, "sub_NEW456")).toBeNull();
  });
});

describe("what the billing page says", () => {
  it("free is free, with nothing to renew", () => {
    expect(describeSubscription(null, null).state).toBe("free");
    expect(describeSubscription({ status: "active", currentPeriodEnd: future(5) }, "free")).toMatchObject({ state: "free", renewsOn: null, effectivePlanKey: "free" });
    // a free subscription carrying an expired "trial" is still just free
    expect(describeSubscription({ status: "trialing", trialEndsAt: past(2), currentPeriodEnd: past(2) }, "free").entitled).toBe(true);
  });

  it("an active paid plan renews on its period end", () => {
    const end = future(20);
    expect(describeSubscription({ status: "active", currentPeriodEnd: end }, "pro")).toMatchObject({ state: "active", entitled: true, effectivePlanKey: "pro", renewsOn: end, endsOn: null });
  });

  it("a cancelled plan with paid time left keeps access, does not renew, and says when it ends", () => {
    const end = future(9);
    expect(describeSubscription({ status: "canceled", currentPeriodEnd: end, canceledAt: new Date() }, "pro")).toMatchObject({ state: "canceled_pending", entitled: true, effectivePlanKey: "pro", renewsOn: null, endsOn: end });
  });

  it("a cancelled plan past its period is expired and falls back to Free, whatever the row still says", () => {
    expect(describeSubscription({ status: "canceled", currentPeriodEnd: past(1) }, "team")).toMatchObject({ state: "expired", entitled: false, effectivePlanKey: "free" });
  });

  it("an overdue plan is shown with its grace deadline, then expires", () => {
    const inGrace = describeSubscription({ status: "past_due", currentPeriodEnd: past(2) }, "pro");
    expect(inGrace).toMatchObject({ state: "past_due", entitled: true, effectivePlanKey: "pro" });
    expect(inGrace.endsOn!.getTime()).toBeGreaterThan(Date.now());
    expect(describeSubscription({ status: "past_due", currentPeriodEnd: past(30) }, "pro")).toMatchObject({ state: "expired", effectivePlanKey: "free" });
  });

  it("a paid trial that ran out is expired", () => {
    expect(describeSubscription({ status: "trialing", trialEndsAt: past(1), currentPeriodEnd: past(1) }, "pro")).toMatchObject({ state: "expired", effectivePlanKey: "free" });
    expect(describeSubscription({ status: "trialing", trialEndsAt: future(3), currentPeriodEnd: future(3) }, "pro")).toMatchObject({ state: "trialing", entitled: true });
  });

  it("incomplete, unpaid and paused are never entitled", () => {
    for (const status of ["incomplete", "unpaid", "paused", "incomplete_expired"]) expect(describeSubscription({ status, currentPeriodEnd: future(10) }, "pro").effectivePlanKey, status).toBe("free");
  });
});
