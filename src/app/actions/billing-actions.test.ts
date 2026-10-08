import { describe, it, expect, vi, beforeEach } from "vitest";
import { PLAN_CATALOG } from "@/lib/constants";

const m = vi.hoisted(() => ({
  flags: { realBilling: true, billingProvider: "razorpay" as "razorpay" | "stripe" | "stub" },
  isProduction: true,
  role: "owner",
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${url}` });
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn().mockResolvedValue(undefined), RateLimitError: class extends Error {} }));
vi.mock("@/lib/env", () => ({
  get flags() {
    return m.flags;
  },
  get isProduction() {
    return m.isProduction;
  },
}));
vi.mock("@/lib/session", () => ({
  requireWorkspace: vi.fn(async () => ({ user: { id: "user1", email: "a@b.co" }, active: { orgRole: m.role, org: { id: "org1" } } })),
}));
vi.mock("@/lib/plans", () => ({ getPlan: vi.fn() }));
vi.mock("@/lib/adapters/razorpay", () => ({ getRazorpaySubscription: vi.fn() }));
vi.mock("@/lib/adapters/billing", async () => {
  class BillingError extends Error {}
  return {
    BillingError,
    startCheckout: vi.fn(),
    applyPlan: vi.fn().mockResolvedValue({}),
    cancelSubscription: vi.fn(),
    reactivateSubscription: vi.fn(),
    mirrorRazorpayInvoices: vi.fn().mockResolvedValue(0),
  };
});
vi.mock("@/lib/db", () => ({
  db: {
    coupon: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    couponRedemption: { findUnique: vi.fn(), create: vi.fn() },
    subscription: { findUnique: vi.fn(), update: vi.fn() },
    organization: { update: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import {
  cancelSubscriptionAction,
  confirmPlanChangeAction,
  confirmRazorpaySubscriptionAction,
  reactivateSubscriptionAction,
  redeemCouponAction,
  startCheckoutAction,
} from "./billing";
import { applyPlan, BillingError, cancelSubscription, reactivateSubscription, startCheckout } from "@/lib/adapters/billing";
import { getRazorpaySubscription } from "@/lib/adapters/razorpay";
import { getPlan } from "@/lib/plans";
import { db } from "@/lib/db";

const row = (key: string, over: object = {}) => {
  const p = PLAN_CATALOG.find((x) => x.key === key)!;
  return { ...p, id: `plan_${key}`, badge: null, features: [...p.features], entitlements: [...p.entitlements], sortIndex: 0, ...over };
};
const redirected = (e: unknown) => (e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT") ?? false;

beforeEach(() => {
  vi.clearAllMocks();
  m.flags.realBilling = true;
  m.flags.billingProvider = "razorpay";
  m.isProduction = true;
  m.role = "owner";
  vi.mocked(getPlan).mockImplementation(async (k) => row(k) as never);
});

describe("who can change billing", () => {
  it("a plain member cannot start checkout, cancel, resume or change the plan", async () => {
    m.role = "viewer";
    await expect(startCheckoutAction("pro", "month")).rejects.toThrow();
    await expect(confirmPlanChangeAction("free", "month")).rejects.toThrow();
    await expect(cancelSubscriptionAction()).rejects.toThrow();
    await expect(reactivateSubscriptionAction()).rejects.toThrow();
    await expect(redeemCouponAction("SAVE10")).rejects.toThrow();
    expect(startCheckout).not.toHaveBeenCalled();
    expect(applyPlan).not.toHaveBeenCalled();
    expect(cancelSubscription).not.toHaveBeenCalled();
  });
});

describe("starting a checkout", () => {
  it("redirects to the provider's checkout on success", async () => {
    vi.mocked(startCheckout).mockResolvedValue("https://pay.test/c");
    await startCheckoutAction("pro", "month", "inr").catch((e) => expect(redirected(e)).toBe(true));
    expect(startCheckout).toHaveBeenCalledWith("org1", "a@b.co", "pro", "month", "inr", "user1");
  });

  it("reports a refusal instead of redirecting or crashing", async () => {
    vi.mocked(startCheckout).mockRejectedValue(new BillingError("Enterprise is arranged with our team."));
    expect(await startCheckoutAction("enterprise", "month")).toEqual({ ok: false, error: "Enterprise is arranged with our team." });
  });

  it("tells the customer nothing was charged on an unexpected failure, and leaks no internals", async () => {
    vi.mocked(startCheckout).mockRejectedValue(new Error("Razorpay POST /plans -> 500 secret-stack-trace"));
    const res = await startCheckoutAction("pro", "month");
    expect(res).toMatchObject({ ok: false });
    expect(JSON.stringify(res)).not.toMatch(/Razorpay|secret|stack/i);
    expect((res as { error: string }).error).toMatch(/nothing has been charged/i);
  });

  it("rejects an unknown plan or interval before any provider call", async () => {
    expect(await startCheckoutAction("platinum", "month")).toMatchObject({ ok: false });
    expect(await startCheckoutAction("pro", "week" as never)).toMatchObject({ ok: false });
    expect(startCheckout).not.toHaveBeenCalled();
  });
});

describe("the no-checkout plan switch can never be a way to take a paid plan for free", () => {
  it("refuses Enterprise in production and in demo mode alike (its price is 0)", async () => {
    expect(await confirmPlanChangeAction("enterprise", "month")).toMatchObject({ ok: false, error: expect.stringMatching(/arranged with our team/) });
    m.isProduction = false;
    m.flags.realBilling = false;
    expect(await confirmPlanChangeAction("enterprise", "month")).toMatchObject({ ok: false });
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("refuses a paid plan whenever real billing is on, even one an admin has edited", async () => {
    expect(await confirmPlanChangeAction("pro", "month")).toMatchObject({ ok: false, error: expect.stringMatching(/checkout/i) });
    vi.mocked(getPlan).mockResolvedValueOnce(row("pro", { priceMonthly: 100, priceMonthlyInr: 0 }) as never);
    expect(await confirmPlanChangeAction("pro", "month")).toMatchObject({ ok: false });
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("refuses a paid plan in production with no provider configured (fail closed)", async () => {
    m.flags.realBilling = false;
    expect(await confirmPlanChangeAction("pro", "year")).toMatchObject({ ok: false, error: expect.stringMatching(/unavailable/i) });
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("does allow Free, and a paid plan in demo mode (no real provider)", async () => {
    m.flags.realBilling = false;
    await confirmPlanChangeAction("free", "month").catch((e) => expect(redirected(e)).toBe(true));
    expect(applyPlan).toHaveBeenCalledTimes(1);
    m.isProduction = false;
    m.flags.realBilling = false;
    await confirmPlanChangeAction("pro", "month").catch((e) => expect(redirected(e)).toBe(true));
    expect(applyPlan).toHaveBeenCalledTimes(2);
  });

  it("with real billing, going back to Free goes through the provider-aware path, never a bare applyPlan that would orphan a live subscription", async () => {
    vi.mocked(startCheckout).mockResolvedValue("/settings/billing?changed=1");
    await confirmPlanChangeAction("free", "month").catch((e) => expect(redirected(e)).toBe(true));
    expect(startCheckout).toHaveBeenCalledWith("org1", "a@b.co", "free", "month", "usd", "user1");
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("reports a failed downgrade honestly instead of redirecting as if it worked", async () => {
    vi.mocked(startCheckout).mockRejectedValue(new BillingError("We couldn't cancel with the payment provider just now, so nothing has changed."));
    expect(await confirmPlanChangeAction("free", "month")).toMatchObject({ ok: false, error: expect.stringMatching(/nothing has changed/) });
  });

  it("rejects an unknown plan key and a bad interval", async () => {
    expect(await confirmPlanChangeAction("platinum", "month")).toMatchObject({ ok: false });
    expect(await confirmPlanChangeAction("free", "decade" as never)).toMatchObject({ ok: false });
  });
});

describe("cancelling and resuming", () => {
  it("cancel says the plan stays until the paid period ends, and reports a provider failure honestly", async () => {
    vi.mocked(cancelSubscription).mockResolvedValue({} as never);
    expect(await cancelSubscriptionAction()).toMatchObject({ ok: true, message: expect.stringMatching(/stays active until the end/) });
    vi.mocked(cancelSubscription).mockRejectedValue(new BillingError("We couldn't cancel with the payment provider just now, so nothing has changed."));
    expect(await cancelSubscriptionAction()).toMatchObject({ ok: false, error: expect.stringMatching(/nothing has changed/) });
  });

  it("resume returns the reason when it is refused, rather than throwing", async () => {
    vi.mocked(reactivateSubscription).mockRejectedValue(new BillingError("This subscription has already ended."));
    expect(await reactivateSubscriptionAction()).toEqual({ ok: false, error: "This subscription has already ended." });
    vi.mocked(reactivateSubscription).mockResolvedValue(null as never);
    expect(await reactivateSubscriptionAction()).toMatchObject({ ok: false });
    vi.mocked(reactivateSubscription).mockResolvedValue({} as never);
    expect(await reactivateSubscriptionAction()).toMatchObject({ ok: true });
  });

  it("an unexpected failure is generic and says nothing changed", async () => {
    vi.mocked(cancelSubscription).mockRejectedValue(new Error("P1001 can't reach database at db.internal:5432"));
    const res = await cancelSubscriptionAction();
    expect(JSON.stringify(res)).not.toMatch(/P1001|db\.internal|5432/);
  });
});

describe("confirming a Razorpay checkout", () => {
  const rzp = (over: object = {}) => ({ id: "sub_RZP1", status: "active", paid_count: 1, customer_id: "cust_1", current_end: Math.floor(Date.now() / 1000) + 86_400 * 30, notes: { orgId: "org1", planKey: "pro", interval: "month" }, ...over });

  it("activates only what Razorpay itself reports as paid, for the caller's own org", async () => {
    vi.mocked(getRazorpaySubscription).mockResolvedValue(rzp() as never);
    expect(await confirmRazorpaySubscriptionAction("sub_RZP1")).toEqual({ ok: true });
    expect(applyPlan).toHaveBeenCalledWith("org1", "pro", "month", "user1", expect.objectContaining({ subscriptionId: "sub_RZP1" }), "razorpay");
  });

  it("refuses another organisation's subscription (the id comes from the browser)", async () => {
    vi.mocked(getRazorpaySubscription).mockResolvedValue(rzp({ notes: { orgId: "someone-else", planKey: "agency", interval: "year" } }) as never);
    expect(await confirmPlanChangeOrSub()).toMatchObject({ ok: false, error: "Unknown subscription" });
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("does not activate an authorised-but-uncharged subscription, nor a created/halted one", async () => {
    for (const over of [{ status: "authenticated", paid_count: 0 }, { status: "created", paid_count: 0 }, { status: "halted" }, { status: "cancelled" }]) {
      vi.mocked(getRazorpaySubscription).mockResolvedValue(rzp(over) as never);
      expect(await confirmRazorpaySubscriptionAction("sub_RZP1")).toMatchObject({ ok: false });
    }
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("rejects a malformed id without calling Razorpay, and does nothing when Razorpay isn't the provider", async () => {
    expect(await confirmRazorpaySubscriptionAction("not a sub id; DROP")).toMatchObject({ ok: false });
    expect(getRazorpaySubscription).not.toHaveBeenCalled();
    m.flags.billingProvider = "stripe";
    expect(await confirmRazorpaySubscriptionAction("sub_RZP1")).toMatchObject({ ok: false });
  });

  it("a Razorpay outage is reported without leaking its error", async () => {
    vi.mocked(getRazorpaySubscription).mockRejectedValue(new Error("Razorpay GET /subscriptions -> 502 <html>"));
    const res = await confirmRazorpaySubscriptionAction("sub_RZP1");
    expect(JSON.stringify(res)).not.toMatch(/502|html/);
  });

  function confirmPlanChangeOrSub() {
    return confirmRazorpaySubscriptionAction("sub_RZP1");
  }
});

describe("coupons", () => {
  const coupon = (over: object = {}) => ({ id: "c1", code: "SAVE", active: true, expiresAt: null, maxRedemptions: 0, redeemedCount: 0, percentOff: 0, amountOff: 0, currency: "usd", ...over });

  it("account credit can't be redeemed where it could never reach a charge (Razorpay), and the code is not consumed", async () => {
    vi.mocked(db.coupon.findUnique).mockResolvedValue(coupon({ amountOff: 2000 }) as never);
    vi.mocked(db.couponRedemption.findUnique).mockResolvedValue(null as never);
    expect(await redeemCouponAction("save")).toMatchObject({ ok: false, error: expect.stringMatching(/can't be used with this payment method/) });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects expired, inactive, used-up and already-redeemed codes", async () => {
    vi.mocked(db.couponRedemption.findUnique).mockResolvedValue(null as never);
    vi.mocked(db.coupon.findUnique).mockResolvedValue(coupon({ active: false }) as never);
    expect(await redeemCouponAction("SAVE")).toMatchObject({ ok: false });
    vi.mocked(db.coupon.findUnique).mockResolvedValue(coupon({ expiresAt: new Date(Date.now() - 1000) }) as never);
    expect(await redeemCouponAction("SAVE")).toMatchObject({ ok: false, error: expect.stringMatching(/expired/) });
    vi.mocked(db.coupon.findUnique).mockResolvedValue(coupon({ maxRedemptions: 5, redeemedCount: 5 }) as never);
    expect(await redeemCouponAction("SAVE")).toMatchObject({ ok: false, error: expect.stringMatching(/fully redeemed/) });
    vi.mocked(db.coupon.findUnique).mockResolvedValue(coupon({ percentOff: 10 }) as never);
    vi.mocked(db.couponRedemption.findUnique).mockResolvedValue({ id: "r" } as never);
    expect(await redeemCouponAction("SAVE")).toMatchObject({ ok: false, error: expect.stringMatching(/already been used/) });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("a percent-off code needs a live subscription, and is described as applying at the next checkout", async () => {
    vi.mocked(db.coupon.findUnique).mockResolvedValue(coupon({ percentOff: 25 }) as never);
    vi.mocked(db.couponRedemption.findUnique).mockResolvedValue(null as never);
    vi.mocked(db.subscription.findUnique).mockResolvedValue(null as never);
    expect(await redeemCouponAction("SAVE")).toMatchObject({ ok: false });
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ status: "active" } as never);
    vi.mocked(db.$transaction).mockResolvedValue(true as never);
    const res = await redeemCouponAction("SAVE");
    expect(res).toMatchObject({ ok: true, message: expect.stringMatching(/25% off applies the next time you start or change a plan/) });
  });

  it("a code that fills up between the check and the claim is refused", async () => {
    vi.mocked(db.coupon.findUnique).mockResolvedValue(coupon({ percentOff: 25, maxRedemptions: 1 }) as never);
    vi.mocked(db.couponRedemption.findUnique).mockResolvedValue(null as never);
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ status: "active" } as never);
    vi.mocked(db.$transaction).mockResolvedValue(false as never);
    expect(await redeemCouponAction("SAVE")).toMatchObject({ ok: false, error: expect.stringMatching(/just been fully redeemed/) });
  });
});
