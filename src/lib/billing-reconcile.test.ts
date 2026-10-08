import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ flags: { realBilling: true }, stripeRetrieve: vi.fn() }));

vi.mock("@/lib/env", () => ({
  get flags() {
    return m.flags;
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/entitlements", () => ({ invalidateOrgPlan: vi.fn() }));
vi.mock("@/lib/adapters/billing", () => ({ stripe: vi.fn(async () => ({ subscriptions: { retrieve: m.stripeRetrieve } })) }));
vi.mock("@/lib/adapters/razorpay", () => ({ getRazorpaySubscription: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    systemSetting: { findUnique: vi.fn(), upsert: vi.fn().mockResolvedValue({}) },
    subscription: { findMany: vi.fn(), update: vi.fn().mockResolvedValue({}) },
  },
}));

import { decideFromRazorpay, decideFromStripe, reconcileSubscriptions } from "./billing-reconcile";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { getRazorpaySubscription } from "@/lib/adapters/razorpay";

const DAY = 86_400_000;
const unix = (ms: number) => Math.floor(ms / 1000);
const local = (over: object = {}) => ({ status: "active", currentPeriodEnd: new Date(Date.now() - 3 * DAY), canceledAt: null as Date | null, ...over });

describe("deciding a correction from Stripe", () => {
  it("does nothing when we already match", () => {
    const end = new Date(Date.now() + 10 * DAY);
    expect(decideFromStripe(local({ currentPeriodEnd: end }), { status: "active", periodEnd: end })).toBeNull();
  });

  it("a renewal we never heard about: stays active and the paid period moves forward", () => {
    const next = new Date(Date.now() + 27 * DAY);
    const fix = decideFromStripe(local(), { status: "active", cancel_at_period_end: false, periodEnd: next })!;
    expect(fix.status).toBe("active");
    expect(fix.currentPeriodEnd).toEqual(next);
  });

  it("a subscription Stripe has ended is cancelled here (we said active, they say canceled)", () => {
    const fix = decideFromStripe(local(), { status: "canceled", periodEnd: new Date(Date.now() - 3 * DAY) })!;
    expect(fix.status).toBe("canceled");
    expect(fix.canceledAt).toBeInstanceOf(Date);
  });

  it("a payment problem becomes past due; an unpaid one is stored as such (not entitled)", () => {
    expect(decideFromStripe(local(), { status: "past_due" })!.status).toBe("past_due");
    expect(decideFromStripe(local(), { status: "unpaid" })!.status).toBe("unpaid");
  });

  it("cancel-at-period-end is recorded as cancelled but keeps its paid time", () => {
    const end = new Date(Date.now() + 5 * DAY);
    const fix = decideFromStripe(local({ currentPeriodEnd: end }), { status: "active", cancel_at_period_end: true, periodEnd: end })!;
    expect(fix.status).toBe("canceled");
    expect(fix.currentPeriodEnd).toEqual(end);
  });

  it("never shortens the paid period", () => {
    const far = new Date(Date.now() + 40 * DAY);
    const fix = decideFromStripe(local({ status: "past_due", currentPeriodEnd: far }), { status: "active", periodEnd: new Date(Date.now() + DAY) })!;
    expect(fix.currentPeriodEnd).toEqual(far);
  });
});

describe("deciding a correction from Razorpay", () => {
  it("an active subscription with a newer cycle end is brought up to date", () => {
    const fix = decideFromRazorpay(local(), { status: "active", current_end: unix(Date.now() + 25 * DAY) })!;
    expect(fix.status).toBe("active");
    expect(fix.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());
  });

  it("a cancelled customer stays cancelled even though Razorpay still says active until the cycle ends", () => {
    const fix = decideFromRazorpay(local({ status: "canceled", canceledAt: new Date() }), { status: "active", current_end: unix(Date.now() + 20 * DAY) })!;
    expect(fix.status).toBe("canceled");
  });

  it("cancelled, completed and expired subscriptions are cancelled here", () => {
    for (const status of ["cancelled", "completed", "expired"]) expect(decideFromRazorpay(local(), { status })!.status, status).toBe("canceled");
  });

  it("halted and pending become past due, but not for someone who already cancelled", () => {
    expect(decideFromRazorpay(local(), { status: "halted" })!.status).toBe("past_due");
    expect(decideFromRazorpay(local({ status: "canceled" }), { status: "halted" })).toBeNull();
  });

  it("states that say nothing about payment change nothing", () => {
    for (const status of ["created", "authenticated", "paused"]) expect(decideFromRazorpay(local(), { status }), status).toBeNull();
  });
});

describe("the reconcile job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.flags.realBilling = true;
    vi.mocked(db.systemSetting.findUnique).mockResolvedValue(null as never);
  });

  const row = (over: object = {}) => ({ id: "s1", orgId: "org1", provider: "razorpay", stripeSubscriptionId: "sub_RZP1", status: "active", currentPeriodEnd: new Date(Date.now() - 3 * DAY), canceledAt: null, ...over });

  it("does nothing without a real billing provider", async () => {
    m.flags.realBilling = false;
    expect(await reconcileSubscriptions()).toMatchObject({ skipped: "not-configured" });
    expect(db.subscription.findMany).not.toHaveBeenCalled();
  });

  it("is throttled so a busy cron doesn't hammer the provider", async () => {
    vi.mocked(db.systemSetting.findUnique).mockResolvedValue({ value: JSON.stringify(new Date().toISOString()) } as never);
    expect(await reconcileSubscriptions()).toMatchObject({ skipped: "throttled" });
    expect(db.subscription.findMany).not.toHaveBeenCalled();
    vi.mocked(db.subscription.findMany).mockResolvedValue([] as never);
    expect(await reconcileSubscriptions({ force: true })).toMatchObject({ checked: 0 });
  });

  it("only looks at real provider subscriptions that are overdue", async () => {
    vi.mocked(db.subscription.findMany).mockResolvedValue([] as never);
    await reconcileSubscriptions();
    const where = vi.mocked(db.subscription.findMany).mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where.provider).toEqual({ in: ["stripe", "razorpay"] });
    expect(where.stripeSubscriptionId).toEqual({ startsWith: "sub_" });
    expect(where.status).toEqual({ in: ["active", "past_due", "trialing"] });
    expect(where.currentPeriodEnd).toEqual({ lt: expect.any(Date) });
  });

  it("corrects a Razorpay subscription the provider has cancelled, and writes an audit trail", async () => {
    vi.mocked(db.subscription.findMany).mockResolvedValue([row()] as never);
    vi.mocked(getRazorpaySubscription).mockResolvedValue({ id: "sub_RZP1", status: "cancelled" } as never);
    const res = await reconcileSubscriptions();
    expect(res).toMatchObject({ checked: 1, corrected: 1, failed: 0 });
    expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "s1" }, data: expect.objectContaining({ status: "canceled" }) }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.reconciled", orgId: "org1" }));
  });

  it("corrects a Stripe subscription whose renewal webhook was missed", async () => {
    vi.mocked(db.subscription.findMany).mockResolvedValue([row({ provider: "stripe", stripeSubscriptionId: "sub_1abc" })] as never);
    m.stripeRetrieve.mockResolvedValue({ status: "active", cancel_at_period_end: false, items: { data: [{ current_period_end: unix(Date.now() + 28 * DAY) }] } });
    const res = await reconcileSubscriptions();
    expect(res.corrected).toBe(1);
    const data = vi.mocked(db.subscription.update).mock.calls[0][0].data as { currentPeriodEnd: Date };
    expect(data.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());
  });

  it("leaves an up-to-date subscription alone", async () => {
    vi.mocked(db.subscription.findMany).mockResolvedValue([row({ currentPeriodEnd: new Date(Date.now() - 3 * DAY) })] as never);
    vi.mocked(getRazorpaySubscription).mockResolvedValue({ id: "sub_RZP1", status: "created" } as never);
    expect(await reconcileSubscriptions()).toMatchObject({ checked: 1, corrected: 0 });
    expect(db.subscription.update).not.toHaveBeenCalled();
  });

  it("one provider failure doesn't stop the rest, and nothing is changed for the one that failed", async () => {
    vi.mocked(db.subscription.findMany).mockResolvedValue([row({ id: "bad", stripeSubscriptionId: "sub_BAD" }), row({ id: "good", stripeSubscriptionId: "sub_GOOD" })] as never);
    vi.mocked(getRazorpaySubscription).mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce({ id: "sub_GOOD", status: "cancelled" } as never);
    const res = await reconcileSubscriptions();
    expect(res).toMatchObject({ checked: 2, corrected: 1, failed: 1 });
    expect(db.subscription.update).toHaveBeenCalledTimes(1);
    expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "good" } }));
  });

  it("never touches demo (stub) subscriptions", async () => {
    vi.mocked(db.subscription.findMany).mockResolvedValue([row({ stripeSubscriptionId: "sub_stub_abc" })] as never);
    await reconcileSubscriptions();
    expect(getRazorpaySubscription).not.toHaveBeenCalled();
    expect(db.subscription.update).not.toHaveBeenCalled();
  });
});
