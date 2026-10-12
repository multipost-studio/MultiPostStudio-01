import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  client: {
    invoices: { search: vi.fn(), pay: vi.fn() },
    invoicePayments: { list: vi.fn() },
    refunds: { create: vi.fn() },
  },
  configured: true,
  rzpList: vi.fn(),
  rzpRefund: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/adapters/billing", () => ({ stripe: async () => (st.configured ? st.client : null) }));
vi.mock("@/lib/adapters/razorpay", () => ({ listRazorpayInvoices: (...a: unknown[]) => st.rzpList(...a), refundRazorpayPayment: (...a: unknown[]) => st.rzpRefund(...a) }));
vi.mock("@/lib/db", () => ({ db: { subscription: { findUnique: vi.fn() }, invoice: { update: vi.fn(async () => ({})) } } }));

import { db } from "@/lib/db";
import { issueRefund, resolvePaymentRef, retryInvoicePayment } from "./refunds";

const inv = (over: Record<string, unknown> = {}) => ({
  id: "i1", orgId: "o1", number: "ABCD-0001", amountDue: 4900,
  periodStart: new Date("2026-09-01T00:00:00Z"), periodEnd: new Date("2026-10-01T00:00:00Z"),
  provider: null as string | null, providerInvoiceId: null as string | null, providerPaymentId: null as string | null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  st.configured = true;
  vi.mocked(db.subscription.findUnique).mockResolvedValue({ provider: "stripe", stripeSubscriptionId: "sub_1" } as never);
  st.client.invoices.search.mockResolvedValue({ data: [{ id: "in_123" }] });
  st.client.invoicePayments.list.mockResolvedValue({ data: [{ payment: { payment_intent: "pi_1" } }] });
});

describe("resolvePaymentRef (Stripe)", () => {
  it("finds the invoice by number, then the paid payment, and remembers the ids", async () => {
    expect(await resolvePaymentRef(inv())).toEqual({ ok: true, ref: { provider: "stripe", invoiceId: "in_123", paymentIntent: "pi_1", charge: undefined } });
    expect(st.client.invoices.search).toHaveBeenCalledWith({ query: 'number:"ABCD-0001"', limit: 1 });
    expect(st.client.invoicePayments.list).toHaveBeenCalledWith({ invoice: "in_123", status: "paid", limit: 5 });
    expect(db.invoice.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { provider: "stripe", providerInvoiceId: "in_123" } });
  });

  it("uses a stored or number-shaped Stripe id without searching", async () => {
    await resolvePaymentRef(inv({ providerInvoiceId: "in_stored" }));
    await resolvePaymentRef(inv({ number: "in_999" }));
    expect(st.client.invoices.search).not.toHaveBeenCalled();
    expect(st.client.invoicePayments.list).toHaveBeenNthCalledWith(1, expect.objectContaining({ invoice: "in_stored" }));
    expect(st.client.invoicePayments.list).toHaveBeenNthCalledWith(2, expect.objectContaining({ invoice: "in_999" }));
  });

  it("falls back to the charge, and reads an expanded payment intent object", async () => {
    st.client.invoicePayments.list.mockResolvedValue({ data: [{ payment: { charge: "ch_1" } }] });
    expect(await resolvePaymentRef(inv({ providerInvoiceId: "in_1" }))).toMatchObject({ ok: true, ref: { charge: "ch_1" } });
    st.client.invoicePayments.list.mockResolvedValue({ data: [{ payment: { payment_intent: { id: "pi_obj" } } }] });
    expect(await resolvePaymentRef(inv({ providerInvoiceId: "in_1" }))).toMatchObject({ ok: true, ref: { paymentIntent: "pi_obj" } });
  });

  it("says why when there is nothing to refund, or Stripe cannot be used", async () => {
    st.client.invoicePayments.list.mockResolvedValue({ data: [] });
    expect(await resolvePaymentRef(inv({ providerInvoiceId: "in_1" }))).toMatchObject({ ok: false, error: expect.stringMatching(/nothing to refund/) });
    st.client.invoices.search.mockResolvedValue({ data: [] });
    expect(await resolvePaymentRef(inv())).toMatchObject({ ok: false, error: expect.stringMatching(/find this invoice/) });
    st.configured = false;
    expect(await resolvePaymentRef(inv())).toMatchObject({ ok: false, error: expect.stringMatching(/isn't configured/) });
  });

  it("never throws when the gateway is down", async () => {
    st.client.invoicePayments.list.mockRejectedValue(new Error("network down"));
    expect(await resolvePaymentRef(inv({ providerInvoiceId: "in_1" }))).toMatchObject({ ok: false, error: expect.stringMatching(/couldn't be reached/) });
  });

  it("an invoice that never went through a gateway is refused", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ provider: "stub", stripeSubscriptionId: null } as never);
    expect(await resolvePaymentRef(inv())).toMatchObject({ ok: false, error: expect.stringMatching(/wasn't billed through a payment gateway/) });
  });
});

describe("resolvePaymentRef (Razorpay)", () => {
  beforeEach(() => vi.mocked(db.subscription.findUnique).mockResolvedValue({ provider: "razorpay", stripeSubscriptionId: "sub_rzp" } as never));

  it("uses the stored payment id", async () => {
    expect(await resolvePaymentRef(inv({ providerPaymentId: "pay_1" }))).toEqual({ ok: true, ref: { provider: "razorpay", paymentId: "pay_1" } });
    expect(st.rzpList).not.toHaveBeenCalled();
  });

  it("finds the payment by matching the billing period and amount, and saves it", async () => {
    st.rzpList.mockResolvedValue([
      { id: "inv_other", status: "paid", amount: 100, payment_id: "pay_wrong", billing_start: 1 },
      { id: "inv_ok", status: "paid", amount: 4900, amount_paid: 4900, payment_id: "pay_ok", billing_start: Date.parse("2026-09-01T00:00:00Z") / 1000 },
    ]);
    expect(await resolvePaymentRef(inv())).toEqual({ ok: true, ref: { provider: "razorpay", paymentId: "pay_ok" } });
    expect(db.invoice.update).toHaveBeenCalledWith({ where: { id: "i1" }, data: { provider: "razorpay", providerInvoiceId: "inv_ok", providerPaymentId: "pay_ok" } });
  });

  it("refuses when no matching paid payment exists", async () => {
    st.rzpList.mockResolvedValue([{ id: "x", status: "issued", amount: 4900 }]);
    expect(await resolvePaymentRef(inv())).toMatchObject({ ok: false });
  });
});

describe("issueRefund", () => {
  const base = { amountMinor: 1250, currency: "usd", idempotencyKey: "refund-r1", requestId: "r1", invoiceId: "i1" };

  it("refunds a Stripe payment intent for exactly the amount, with the idempotency key", async () => {
    st.client.refunds.create.mockResolvedValue({ id: "re_1" });
    expect(await issueRefund({ ...base, ref: { provider: "stripe", invoiceId: "in_1", paymentIntent: "pi_1" } })).toEqual({ ok: true, providerRefundId: "re_1" });
    expect(st.client.refunds.create).toHaveBeenCalledWith({ payment_intent: "pi_1", amount: 1250, metadata: { refundRequestId: "r1", invoiceId: "i1" } }, { idempotencyKey: "refund-r1" });
  });

  it("uses the charge when there is no payment intent", async () => {
    st.client.refunds.create.mockResolvedValue({ id: "re_2" });
    await issueRefund({ ...base, ref: { provider: "stripe", invoiceId: "in_1", charge: "ch_1" } });
    expect(st.client.refunds.create.mock.calls[0][0]).toMatchObject({ charge: "ch_1", amount: 1250 });
    expect(st.client.refunds.create.mock.calls[0][0]).not.toHaveProperty("payment_intent");
  });

  it("refunds a Razorpay payment with the idempotency key", async () => {
    st.rzpRefund.mockResolvedValue({ id: "rfnd_1" });
    expect(await issueRefund({ ...base, ref: { provider: "razorpay", paymentId: "pay_1" } })).toEqual({ ok: true, providerRefundId: "rfnd_1" });
    expect(st.rzpRefund).toHaveBeenCalledWith("pay_1", 1250, "refund-r1", { refundRequestId: "r1", invoiceId: "i1" });
  });

  it("reports a gateway error as a failure, clipped, without throwing", async () => {
    st.client.refunds.create.mockRejectedValue(new Error("charge_already_refunded ".repeat(40)));
    const r = await issueRefund({ ...base, ref: { provider: "stripe", invoiceId: "in_1", paymentIntent: "pi_1" } });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error.length).toBeLessThanOrEqual(300);
    st.rzpRefund.mockResolvedValue({});
    expect(await issueRefund({ ...base, ref: { provider: "razorpay", paymentId: "pay_1" } })).toMatchObject({ ok: false });
  });
});

describe("retryInvoicePayment", () => {
  it("asks Stripe to pay the invoice and reports the outcome", async () => {
    st.client.invoices.pay.mockResolvedValue({ status: "paid" });
    expect(await retryInvoicePayment(inv({ providerInvoiceId: "in_1" }))).toMatchObject({ ok: true });
    expect(st.client.invoices.pay).toHaveBeenCalledWith("in_1");
    st.client.invoices.pay.mockResolvedValue({ status: "open" });
    expect(await retryInvoicePayment(inv({ providerInvoiceId: "in_1" }))).toMatchObject({ ok: false, error: expect.stringMatching(/still open/) });
  });
  it("turns a Stripe error into a message", async () => {
    st.client.invoices.pay.mockRejectedValue(new Error("Your card was declined."));
    expect(await retryInvoicePayment(inv({ providerInvoiceId: "in_1" }))).toMatchObject({ ok: false, error: expect.stringMatching(/declined/) });
  });
  it("Razorpay has no manual retry, and stub invoices are refused", async () => {
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ provider: "razorpay" } as never);
    expect(await retryInvoicePayment(inv())).toMatchObject({ ok: false, error: expect.stringMatching(/Razorpay/) });
    vi.mocked(db.subscription.findUnique).mockResolvedValue({ provider: "stub" } as never);
    expect(await retryInvoicePayment(inv())).toMatchObject({ ok: false });
    expect(st.client.invoices.pay).not.toHaveBeenCalled();
  });
});
