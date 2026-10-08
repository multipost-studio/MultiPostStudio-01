import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  construct: vi.fn(),
  retrieve: vi.fn(),
  chargeRetrieve: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: { STRIPE_WEBHOOK_SECRET: "whsec" }, flags: { billingProvider: "stripe", realBilling: true } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/entitlements", () => ({ invalidateOrgPlan: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/webhook-idempotency", () => ({ claimWebhookEvent: vi.fn(), releaseWebhookEvent: vi.fn() }));
vi.mock("@/lib/affiliates", () => ({ generateCommissionForInvoice: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/adapters/billing", () => ({
  stripe: vi.fn(async () => ({ webhooks: { constructEvent: m.construct }, subscriptions: { retrieve: m.retrieve }, charges: { retrieve: m.chargeRetrieve } })),
  applyPlan: vi.fn().mockResolvedValue({}),
  markSubscriptionCanceled: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/db", () => ({
  db: {
    subscription: { findFirst: vi.fn(), update: vi.fn() },
    invoice: { upsert: vi.fn().mockResolvedValue({ id: "inv1" }) },
  },
}));

import { POST } from "./route";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { claimWebhookEvent, releaseWebhookEvent } from "@/lib/webhook-idempotency";
import { applyPlan, markSubscriptionCanceled } from "@/lib/adapters/billing";

const DAY = 86_400_000;
const unix = (ms: number) => Math.floor(ms / 1000);
const md = { orgId: "org1", planKey: "pro", interval: "month" };

const send = (event: object) => {
  m.construct.mockReturnValue(event);
  return POST(new Request("https://app.test/api/webhooks/stripe", { method: "POST", body: "{}", headers: { "stripe-signature": "sig" } }) as unknown as NextRequest);
};
const subEvent = (type: string, over: Record<string, unknown> = {}) => ({
  id: `evt_${Math.random().toString(36).slice(2)}`,
  type,
  data: { object: { id: "sub_1abc", status: "active", customer: "cus_1", metadata: md, cancel_at_period_end: false, items: { data: [{ current_period_end: unix(Date.now() + 30 * DAY) }] }, ...over } },
});
const local = (over: Record<string, unknown> = {}) => ({ id: "local1", orgId: "org1", status: "active", currentPeriodEnd: new Date(Date.now() + 10 * DAY), canceledAt: null, ...over });
const invoiceEvent = (type: string, over: Record<string, unknown> = {}) => ({
  id: "evt_inv",
  type,
  data: { object: { id: "in_1", number: "INV-1", subscription: "sub_1abc", customer: "cus_1", amount_paid: 1800, amount_due: 1800, currency: "usd", lines: { data: [{ period: { start: unix(Date.now()), end: unix(Date.now() + 30 * DAY) } }] }, ...over } },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(claimWebhookEvent).mockResolvedValue(true);
  vi.mocked(db.subscription.findFirst).mockResolvedValue(local() as never);
  m.retrieve.mockResolvedValue({ id: "sub_1abc", status: "active", cancel_at_period_end: false });
});

describe("Stripe webhook", () => {
  it("rejects a payload whose signature doesn't verify", async () => {
    m.construct.mockImplementation(() => {
      throw new Error("bad sig");
    });
    const res = await POST(new Request("https://app.test/api/webhooks/stripe", { method: "POST", body: "{}", headers: { "stripe-signature": "x" } }) as unknown as NextRequest);
    expect(res.status).toBe(400);
    expect(claimWebhookEvent).not.toHaveBeenCalled();
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("acknowledges a redelivered event without acting on it again", async () => {
    vi.mocked(claimWebhookEvent).mockResolvedValue(false);
    const res = await send(subEvent("customer.subscription.updated"));
    expect(await res.json()).toEqual({ received: true, duplicate: true });
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it("checkout completion activates the plan for the org Stripe's own metadata names", async () => {
    m.retrieve.mockResolvedValue({ id: "sub_1abc", items: { data: [{ current_period_end: unix(Date.now() + 30 * DAY) }] } });
    await send({ id: "evt_c", type: "checkout.session.completed", data: { object: { metadata: md, subscription: "sub_1abc", customer: "cus_1" } } });
    expect(applyPlan).toHaveBeenCalledWith("org1", "pro", "month", undefined, expect.objectContaining({ subscriptionId: "sub_1abc" }), "stripe");
  });

  it("a subscription update that merely echoes the customer's cancellation records it as cancelled, not active", async () => {
    await send(subEvent("customer.subscription.updated", { cancel_at_period_end: true }));
    expect(applyPlan).not.toHaveBeenCalled();
    expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "canceled" }) }));
  });

  it("an ordinary active update re-applies the plan", async () => {
    await send(subEvent("customer.subscription.updated"));
    expect(applyPlan).toHaveBeenCalled();
  });

  it("never moves the paid period backwards on a stale update", async () => {
    const future = new Date(Date.now() + 60 * DAY);
    vi.mocked(db.subscription.findFirst).mockResolvedValue(local({ currentPeriodEnd: future }) as never);
    await send(subEvent("customer.subscription.updated", { status: "past_due" }));
    const data = vi.mocked(db.subscription.update).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.status).toBe("past_due");
    expect(data.currentPeriodEnd).toBeUndefined();
  });

  it("an ended subscription ends access now and never calls Stripe back", async () => {
    await send(subEvent("customer.subscription.deleted", { status: "canceled" }));
    expect(markSubscriptionCanceled).toHaveBeenCalledWith("org1", undefined, { endNow: true, source: "stripe" });
  });

  it("a paid invoice mirrors the receipt once (upsert on the invoice number) and clears past-due", async () => {
    vi.mocked(db.subscription.findFirst).mockResolvedValue(local({ status: "past_due" }) as never);
    await send(invoiceEvent("invoice.payment_succeeded"));
    expect(db.invoice.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { number: "INV-1" } }));
    expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "active" }) }));
  });

  it("a late paid-invoice event cannot revive a plan Stripe now reports as cancelling", async () => {
    vi.mocked(db.subscription.findFirst).mockResolvedValue(local({ status: "canceled" }) as never);
    m.retrieve.mockResolvedValue({ status: "active", cancel_at_period_end: true });
    await send(invoiceEvent("invoice.payment_succeeded"));
    expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "canceled" }) }));
  });

  it("when Stripe can't be reached, a cancelled customer still isn't revived by a paid invoice", async () => {
    vi.mocked(db.subscription.findFirst).mockResolvedValue(local({ status: "canceled" }) as never);
    m.retrieve.mockRejectedValue(new Error("network"));
    await send(invoiceEvent("invoice.payment_succeeded"));
    expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "canceled" }) }));
  });

  it("a failed renewal on a live subscription marks it past due", async () => {
    m.retrieve.mockResolvedValue({ status: "past_due", cancel_at_period_end: false });
    await send(invoiceEvent("invoice.payment_failed"));
    expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "past_due" }) }));
  });

  it("a stale 'failed' event after the customer has since paid does not leave them past due", async () => {
    m.retrieve.mockResolvedValue({ status: "active", cancel_at_period_end: false });
    await send(invoiceEvent("invoice.payment_failed"));
    expect(db.subscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "active" }) }));
  });

  it("an older invoice does not shorten the paid period", async () => {
    const far = new Date(Date.now() + 90 * DAY);
    vi.mocked(db.subscription.findFirst).mockResolvedValue(local({ currentPeriodEnd: far }) as never);
    await send(invoiceEvent("invoice.payment_succeeded"));
    const data = vi.mocked(db.subscription.update).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.currentPeriodEnd).toBeUndefined();
  });

  it("an invoice for a subscription we don't know changes nothing", async () => {
    vi.mocked(db.subscription.findFirst).mockResolvedValue(null as never);
    const res = await send(invoiceEvent("invoice.payment_succeeded"));
    expect(res.status).toBe(200);
    expect(db.invoice.upsert).not.toHaveBeenCalled();
    expect(db.subscription.update).not.toHaveBeenCalled();
  });

  it("records a refund for the team without revoking access", async () => {
    await send({ id: "evt_r", type: "charge.refunded", data: { object: { id: "ch_1", customer: "cus_1", amount_refunded: 1800, currency: "usd" } } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.refund_received", orgId: "org1" }));
    expect(markSubscriptionCanceled).not.toHaveBeenCalled();
    expect(db.subscription.update).not.toHaveBeenCalled();
  });

  it("records a dispute, finding the customer through the charge", async () => {
    m.chargeRetrieve.mockResolvedValue({ customer: "cus_1" });
    await send({ id: "evt_d", type: "charge.dispute.created", data: { object: { id: "dp_1", charge: "ch_1", amount: 1800, currency: "usd" } } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.dispute_opened", orgId: "org1" }));
  });

  it("releases the claim and answers 500 on failure so Stripe retries", async () => {
    vi.mocked(applyPlan).mockRejectedValueOnce(new Error("db down"));
    const res = await send(subEvent("customer.subscription.updated"));
    expect(res.status).toBe(500);
    expect(releaseWebhookEvent).toHaveBeenCalled();
  });
});
