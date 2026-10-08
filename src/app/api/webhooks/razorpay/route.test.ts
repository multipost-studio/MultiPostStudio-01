import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({ env: { RAZORPAY_WEBHOOK_SECRET: "whsec" }, flags: { billingProvider: "razorpay", realBilling: true } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/entitlements", () => ({ invalidateOrgPlan: vi.fn() }));
vi.mock("@/lib/webhook-idempotency", () => ({ claimWebhookEvent: vi.fn(), releaseWebhookEvent: vi.fn() }));
vi.mock("@/lib/adapters/billing", () => ({
  applyPlan: vi.fn().mockResolvedValue({}),
  markSubscriptionCanceled: vi.fn().mockResolvedValue({}),
  mirrorRazorpayInvoices: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/adapters/razorpay", () => ({ verifyRazorpayWebhook: vi.fn(), getRazorpaySubscription: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { subscription: { findFirst: vi.fn(), update: vi.fn() } } }));

import { POST } from "./route";
import { db } from "@/lib/db";
import { claimWebhookEvent, releaseWebhookEvent } from "@/lib/webhook-idempotency";
import { applyPlan, markSubscriptionCanceled, mirrorRazorpayInvoices } from "@/lib/adapters/billing";
import { getRazorpaySubscription, verifyRazorpayWebhook } from "@/lib/adapters/razorpay";

const DAY = 86_400_000;
const unix = (ms: number) => Math.floor(ms / 1000);

function call(event: string, sub: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  const body = JSON.stringify({
    event,
    created_at: 1_790_000_000,
    payload: { subscription: { entity: { id: "sub_RZP1", status: "active", paid_count: 1, current_end: unix(Date.now() + 30 * DAY), customer_id: "cust_1", notes: { orgId: "org1", planKey: "pro", interval: "month" }, ...sub } }, ...extra },
  });
  return POST(new Request("https://app.test/api/webhooks/razorpay", { method: "POST", body, headers: { "x-razorpay-signature": "sig" } }) as unknown as NextRequest);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyRazorpayWebhook).mockReturnValue(true);
  vi.mocked(claimWebhookEvent).mockResolvedValue(true);
  vi.mocked(getRazorpaySubscription).mockResolvedValue({ id: "sub_RZP1", status: "active", paid_count: 1 } as never);
  vi.mocked(db.subscription.findFirst).mockResolvedValue(null as never);
});

describe("Razorpay webhook", () => {
  it("rejects a bad signature before touching anything", async () => {
    vi.mocked(verifyRazorpayWebhook).mockReturnValue(false);
    const res = await call("subscription.activated");
    expect(res.status).toBe(400);
    expect(claimWebhookEvent).not.toHaveBeenCalled();
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("activates the plan from a genuine, paid subscription and mirrors the receipt", async () => {
    const res = await call("subscription.activated");
    expect(res.status).toBe(200);
    expect(applyPlan).toHaveBeenCalledWith("org1", "pro", "month", undefined, expect.objectContaining({ subscriptionId: "sub_RZP1" }), "razorpay");
    expect(mirrorRazorpayInvoices).toHaveBeenCalledWith("org1", "sub_RZP1");
  });

  it("a redelivered event is acknowledged and changes nothing", async () => {
    vi.mocked(claimWebhookEvent).mockResolvedValue(false);
    const res = await call("subscription.charged");
    expect(await res.json()).toEqual({ received: true, duplicate: true });
    expect(applyPlan).not.toHaveBeenCalled();
    expect(mirrorRazorpayInvoices).not.toHaveBeenCalled();
  });

  it("keys each charge separately, so a later renewal isn't dropped as a duplicate of the first", async () => {
    await call("subscription.charged", {}, { payment: { entity: { id: "pay_1" } } });
    await call("subscription.charged", {}, { payment: { entity: { id: "pay_2" } } });
    const keys = vi.mocked(claimWebhookEvent).mock.calls.map((c) => c[1]);
    expect(new Set(keys).size).toBe(2);
  });

  it("a late 'activated' for a subscription Razorpay now reports as cancelled does not grant the plan", async () => {
    vi.mocked(getRazorpaySubscription).mockResolvedValue({ id: "sub_RZP1", status: "cancelled", paid_count: 1 } as never);
    await call("subscription.activated");
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("an 'authenticated' subscription with no successful charge yet does not grant the plan", async () => {
    vi.mocked(getRazorpaySubscription).mockResolvedValue({ id: "sub_RZP1", status: "authenticated", paid_count: 0 } as never);
    await call("subscription.activated", { status: "authenticated", paid_count: 0 });
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("a charge for the cycle already paid does not turn a customer's cancellation back into a renewal", async () => {
    vi.mocked(db.subscription.findFirst).mockResolvedValue({ id: "local1", orgId: "org1", status: "canceled", currentPeriodEnd: new Date(Date.now() + 2 * DAY) } as never);
    await call("subscription.charged");
    expect(applyPlan).not.toHaveBeenCalled();
    // It still extends the paid period they are owed, and mirrors the receipt.
    expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "local1" }, data: { currentPeriodEnd: expect.any(Date) } }));
    expect(mirrorRazorpayInvoices).toHaveBeenCalled();
  });

  it("an explicit resume does reactivate a cancelled subscription", async () => {
    vi.mocked(db.subscription.findFirst).mockResolvedValue({ id: "local1", orgId: "org1", status: "canceled", currentPeriodEnd: new Date(Date.now() + 2 * DAY) } as never);
    await call("subscription.resumed");
    expect(applyPlan).toHaveBeenCalled();
  });

  it("falls back to the signed payload when Razorpay can't be reached, so a real payment isn't lost", async () => {
    vi.mocked(getRazorpaySubscription).mockRejectedValue(new Error("network"));
    await call("subscription.activated");
    expect(applyPlan).toHaveBeenCalled();
  });

  it("records a provider cancellation without calling the provider again", async () => {
    vi.mocked(db.subscription.findFirst).mockResolvedValue({ id: "local1", orgId: "org1", status: "active", currentPeriodEnd: new Date() } as never);
    await call("subscription.cancelled", { status: "cancelled" });
    expect(markSubscriptionCanceled).toHaveBeenCalledWith("org1", undefined, { source: "razorpay" });
  });

  it("a failed payment marks a live subscription past due, but leaves a cancelled one cancelled", async () => {
    vi.mocked(db.subscription.findFirst).mockResolvedValue({ id: "local1", orgId: "org1", status: "active", currentPeriodEnd: new Date(Date.now() - DAY) } as never);
    await call("subscription.halted", { status: "halted" });
    expect(db.subscription.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "past_due" }) }));
    vi.mocked(db.subscription.findFirst).mockResolvedValue({ id: "local1", orgId: "org1", status: "canceled", currentPeriodEnd: new Date(Date.now() - DAY) } as never);
    await call("subscription.halted", { status: "halted" });
    expect(db.subscription.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "canceled" }) }));
  });

  it("releases the claim and answers 500 when handling fails, so Razorpay's retry isn't swallowed as a duplicate", async () => {
    vi.mocked(applyPlan).mockRejectedValueOnce(new Error("db down"));
    const res = await call("subscription.activated");
    expect(res.status).toBe(500);
    expect(releaseWebhookEvent).toHaveBeenCalled();
  });

  it("ignores events it doesn't handle", async () => {
    const res = await call("payment.captured");
    expect(res.status).toBe(200);
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const res = await POST(new Request("https://app.test/api/webhooks/razorpay", { method: "POST", body: "{nope", headers: { "x-razorpay-signature": "sig" } }) as unknown as NextRequest);
    expect(res.status).toBe(400);
  });
});
