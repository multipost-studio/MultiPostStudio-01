import { describe, it, expect, vi, beforeEach } from "vitest";
import { adminAnalytics } from "./admin-analytics";
import { db } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  db: {
    user: { count: vi.fn(), findMany: vi.fn() },
    organization: { count: vi.fn() },
    workspace: { count: vi.fn() },
    post: { count: vi.fn(), findMany: vi.fn() },
    subscription: { findMany: vi.fn() },
    supportTicket: { count: vi.fn() },
    invoice: { findMany: vi.fn() },
    usageRecord: { findMany: vi.fn() },
    affiliate: { count: vi.fn() },
    affiliateConversion: { count: vi.fn() },
    affiliateCommission: { aggregate: vi.fn() },
    systemEvent: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}));

const plan = { name: "Pro", priceMonthly: 2900, priceAnnual: 29000, priceMonthlyInr: 249900, priceAnnualInr: 2400000 };
const sub = (o: Record<string, unknown> = {}) => ({ status: "active", interval: "month", provider: "stripe", discountPct: 0, plan, ...o });
const PAST = new Date(Date.now() - 86_400_000);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.user.count).mockResolvedValue(10);
  vi.mocked(db.user.findMany).mockResolvedValue([] as never);
  vi.mocked(db.organization.count).mockResolvedValue(4);
  vi.mocked(db.workspace.count).mockResolvedValue(5);
  vi.mocked(db.post.count).mockResolvedValue(50);
  vi.mocked(db.post.findMany).mockResolvedValue([] as never);
  vi.mocked(db.subscription.findMany).mockResolvedValue([] as never);
  vi.mocked(db.supportTicket.count).mockResolvedValue(0);
  vi.mocked(db.invoice.findMany).mockResolvedValue([] as never);
  vi.mocked(db.usageRecord.findMany).mockResolvedValue([] as never);
  vi.mocked(db.affiliate.count).mockResolvedValue(0);
  vi.mocked(db.affiliateConversion.count).mockResolvedValue(0);
  vi.mocked(db.affiliateCommission.aggregate).mockResolvedValue({ _sum: { amountMinor: 0 } } as never);
  vi.mocked(db.systemEvent.findMany).mockResolvedValue([] as never);
  vi.mocked(db.auditLog.findMany).mockResolvedValue([] as never);
});

describe("adminAnalytics correctness", () => {
  it("never counts deleted users in totals, signups or the newest-users list", async () => {
    await adminAnalytics();
    expect(db.user.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    for (const call of vi.mocked(db.user.findMany).mock.calls) expect(call[0]!.where).toMatchObject({ deletedAt: null });
  });

  it("applies subscription discounts and ignores trials, canceled and expired subs in MRR", async () => {
    vi.mocked(db.subscription.findMany).mockResolvedValue([
      sub(), // 2900
      sub({ discountPct: 50 }), // 1450
      sub({ status: "trialing", trialEndsAt: new Date(Date.now() + 86_400_000) }), // not revenue yet
      sub({ status: "canceled", currentPeriodEnd: PAST }),
    ] as never);
    const a = await adminAnalytics();
    expect(a.stats.mrr).toBe(4350);
    expect(a.stats.activeSubs).toBe(2);
  });

  it("keeps INR subscriptions out of the USD MRR and reports them separately", async () => {
    vi.mocked(db.subscription.findMany).mockResolvedValue([sub(), sub({ provider: "razorpay" })] as never);
    const a = await adminAnalytics();
    expect(a.stats.mrr).toBe(2900);
    expect(a.stats.mrrInr).toBe(249900);
  });

  it("does not add INR invoices into the USD revenue series", async () => {
    const at = new Date();
    vi.mocked(db.invoice.findMany).mockResolvedValue([
      { amountDue: 2900, currency: "usd", createdAt: at },
      { amountDue: 249900, currency: "inr", createdAt: at },
    ] as never);
    const a = await adminAnalytics();
    expect(a.revenueSeries.reduce((s, b) => s + b.value, 0)).toBe(29);
    expect(a.revenueSeriesInr.reduce((s, b) => s + b.value, 0)).toBe(2499);
  });

  it("counts only subscriptions that currently grant access in the plan mix", async () => {
    vi.mocked(db.subscription.findMany).mockResolvedValue([sub(), sub({ status: "canceled", currentPeriodEnd: PAST })] as never);
    const a = await adminAnalytics();
    expect(a.planDonut).toEqual([{ name: "Pro", value: 1 }]);
  });
});
