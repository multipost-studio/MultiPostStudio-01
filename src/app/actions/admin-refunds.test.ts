import { beforeEach, describe, expect, it, vi } from "vitest";

const gw = vi.hoisted(() => ({ resolve: vi.fn(), issue: vi.fn(), retry: vi.fn(), reverse: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdminPermission: vi.fn() }));
vi.mock("@/lib/notifications/service", () => ({ createNotification: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(), RateLimitError: class RateLimitError extends Error {} }));
vi.mock("@/lib/affiliates", () => ({ reverseCommissionForInvoice: (...a: unknown[]) => gw.reverse(...a) }));
vi.mock("@/lib/adapters/refunds", () => ({
  resolvePaymentRef: (...a: unknown[]) => gw.resolve(...a),
  issueRefund: (...a: unknown[]) => gw.issue(...a),
  retryInvoicePayment: (...a: unknown[]) => gw.retry(...a),
}));
vi.mock("@/lib/db", () => ({
  db: {
    invoice: { findUnique: vi.fn() },
    refundRequest: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    systemSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { requireAdminPermission } from "@/lib/session";
import { cancelRefundRequestAction, decideRefundAction, requestRefundAction, retryInvoicePaymentAction, setRefundSelfApprovalAction } from "./admin-refunds";

const REASON = "Customer was double charged";
const invoice = { id: "i1", orgId: "o1", number: "N-1", amountDue: 5000, currency: "usd", status: "paid" };
const pending = { id: "r1", invoiceId: "i1", orgId: "o1", amountMinor: 2000, currency: "usd", status: "pending", requestedById: "alice" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdminPermission).mockResolvedValue({ id: "alice" } as never);
  vi.mocked(db.invoice.findUnique).mockResolvedValue(invoice as never);
  vi.mocked(db.refundRequest.findMany).mockResolvedValue([] as never);
  vi.mocked(db.refundRequest.create).mockResolvedValue({ id: "r1" } as never);
  vi.mocked(db.refundRequest.findUnique).mockResolvedValue(pending as never);
  vi.mocked(db.refundRequest.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(db.refundRequest.update).mockResolvedValue({} as never);
  vi.mocked(db.systemSetting.findUnique).mockResolvedValue(null as never);
  gw.resolve.mockResolvedValue({ ok: true, ref: { provider: "stripe", invoiceId: "in_1", paymentIntent: "pi_1" } });
  gw.issue.mockResolvedValue({ ok: true, providerRefundId: "re_1" });
  gw.reverse.mockResolvedValue(undefined);
  vi.mocked(enforceRateLimit).mockResolvedValue(undefined as never);
});

describe("requestRefundAction", () => {
  it("needs refunds.request and a reason", async () => {
    vi.mocked(requireAdminPermission).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(requestRefundAction({ invoiceId: "i1", amount: "10" }, REASON)).rejects.toThrow("NEXT_REDIRECT");
    expect(requireAdminPermission).toHaveBeenCalledWith("refunds.request");
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: "alice" } as never);
    for (const bad of [undefined, "", "short"]) expect(await requestRefundAction({ invoiceId: "i1", amount: "10" }, bad)).toMatchObject({ ok: false });
    expect(db.refundRequest.create).not.toHaveBeenCalled();
  });

  it("creates a pending request in minor units, records who asked, and sends nothing to the gateway", async () => {
    expect(await requestRefundAction({ invoiceId: "i1", amount: "20.00" }, REASON)).toMatchObject({ ok: true });
    expect(db.refundRequest.create).toHaveBeenCalledWith({ data: { invoiceId: "i1", orgId: "o1", amountMinor: 2000, currency: "usd", reason: REASON, requestedById: "alice", provider: "stripe" }, select: { id: true } });
    expect(gw.issue).not.toHaveBeenCalled();
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.refund_requested", reason: REASON }));
  });

  it("cannot exceed what is left once earlier requests are counted", async () => {
    vi.mocked(db.refundRequest.findMany).mockResolvedValue([{ status: "refunded", amountMinor: 3000 }, { status: "pending", amountMinor: 1500 }, { status: "rejected", amountMinor: 9999 }] as never);
    expect(await requestRefundAction({ invoiceId: "i1", amount: "5.01" }, REASON)).toMatchObject({ ok: false });
    expect(await requestRefundAction({ invoiceId: "i1", amount: "50" }, REASON)).toMatchObject({ ok: false });
    expect(await requestRefundAction({ invoiceId: "i1", amount: "5.00" }, REASON)).toMatchObject({ ok: true });
    vi.mocked(db.refundRequest.findMany).mockResolvedValue([{ status: "refunded", amountMinor: 3000 }] as never);
    expect(await requestRefundAction({ invoiceId: "i1", amount: "20.00" }, REASON)).toMatchObject({ ok: true });
  });

  it("refuses an unpaid or missing invoice, bad amounts, and a payment that cannot be found at the gateway", async () => {
    vi.mocked(db.invoice.findUnique).mockResolvedValue({ ...invoice, status: "open" } as never);
    expect(await requestRefundAction({ invoiceId: "i1", amount: "10" }, REASON)).toMatchObject({ ok: false });
    vi.mocked(db.invoice.findUnique).mockResolvedValue(null as never);
    expect(await requestRefundAction({ invoiceId: "i1", amount: "10" }, REASON)).toMatchObject({ ok: false });
    vi.mocked(db.invoice.findUnique).mockResolvedValue(invoice as never);
    for (const amount of ["0", "-1", "abc", ""]) expect(await requestRefundAction({ invoiceId: "i1", amount }, REASON)).toMatchObject({ ok: false });
    gw.resolve.mockResolvedValue({ ok: false, error: "Stripe has no paid payment for this invoice" });
    expect(await requestRefundAction({ invoiceId: "i1", amount: "10" }, REASON)).toMatchObject({ ok: false, error: expect.stringMatching(/Stripe/) });
    expect(db.refundRequest.create).not.toHaveBeenCalled();
  });
});

describe("decideRefundAction: the two-person rule", () => {
  const approve = { id: "r1", decision: "approve" as const };

  it("needs refunds.approve", async () => {
    vi.mocked(requireAdminPermission).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(decideRefundAction(approve, REASON)).rejects.toThrow("NEXT_REDIRECT");
    expect(requireAdminPermission).toHaveBeenCalledWith("refunds.approve");
  });

  it("the person who asked cannot approve it, and nothing is sent", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: "alice" } as never);
    expect(await decideRefundAction(approve, REASON)).toMatchObject({ ok: false, error: expect.stringMatching(/someone other/) });
    expect(db.refundRequest.updateMany).not.toHaveBeenCalled();
    expect(gw.issue).not.toHaveBeenCalled();
  });

  it("they can when a full administrator has allowed self-approval", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: "alice" } as never);
    vi.mocked(db.systemSetting.findUnique).mockResolvedValue({ value: "true" } as never);
    expect(await decideRefundAction(approve, REASON)).toMatchObject({ ok: true });
  });

  it("another person's approval claims the request, refunds exactly the amount with the request id as the idempotency key, and records the result", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: "bob" } as never);
    vi.mocked(db.refundRequest.findMany).mockResolvedValueOnce([] as never).mockResolvedValue([{ status: "refunded", amountMinor: 2000 }] as never);
    expect(await decideRefundAction(approve, REASON)).toMatchObject({ ok: true });
    expect(db.refundRequest.updateMany).toHaveBeenCalledWith({ where: { id: "r1", status: "pending" }, data: expect.objectContaining({ status: "processing", decidedById: "bob" }) });
    expect(gw.issue).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 2000, idempotencyKey: "refund-r1", requestId: "r1" }));
    expect(db.refundRequest.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { status: "refunded", providerRefundId: "re_1", error: null } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.refund_issued", reason: REASON }));
    expect(gw.reverse).not.toHaveBeenCalled(); // partial refund
  });

  it("a full refund reverses the affiliate commission", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: "bob" } as never);
    vi.mocked(db.refundRequest.findUnique).mockResolvedValue({ ...pending, amountMinor: 5000 } as never);
    vi.mocked(db.refundRequest.findMany).mockResolvedValueOnce([] as never).mockResolvedValue([{ status: "refunded", amountMinor: 5000 }] as never);
    await decideRefundAction(approve, REASON);
    expect(gw.reverse).toHaveBeenCalledWith("i1", expect.any(String));
  });

  it("a gateway failure is recorded as failed, reported honestly, and never as a refund", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: "bob" } as never);
    gw.issue.mockResolvedValue({ ok: false, error: "charge_already_refunded" });
    const r = await decideRefundAction(approve, REASON);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/charge_already_refunded/) });
    expect(db.refundRequest.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: { status: "failed", error: "charge_already_refunded" } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.refund_failed" }));
    expect(logAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: "admin.refund_issued" }));
  });

  it("an unresolvable payment fails the request without calling the gateway", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: "bob" } as never);
    gw.resolve.mockResolvedValue({ ok: false, error: "Couldn't find the Razorpay payment" });
    expect(await decideRefundAction(approve, REASON)).toMatchObject({ ok: false });
    expect(gw.issue).not.toHaveBeenCalled();
    expect(db.refundRequest.update).toHaveBeenCalledWith({ where: { id: "r1" }, data: expect.objectContaining({ status: "failed" }) });
  });

  it("two approvers racing: only the one who wins the claim sends the refund", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: "bob" } as never);
    vi.mocked(db.refundRequest.updateMany).mockResolvedValue({ count: 0 } as never);
    expect(await decideRefundAction(approve, REASON)).toMatchObject({ ok: false });
    expect(gw.issue).not.toHaveBeenCalled();
  });

  it("re-checks what is left at approval time", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: "bob" } as never);
    vi.mocked(db.refundRequest.findMany).mockResolvedValue([{ status: "refunded", amountMinor: 4000 }] as never);
    expect(await decideRefundAction(approve, REASON)).toMatchObject({ ok: false });
    expect(db.refundRequest.updateMany).not.toHaveBeenCalled();
    expect(gw.issue).not.toHaveBeenCalled();
  });

  it("only a pending request can be decided; a reason is always required", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: "bob" } as never);
    vi.mocked(db.refundRequest.findUnique).mockResolvedValue({ ...pending, status: "refunded" } as never);
    expect(await decideRefundAction(approve, REASON)).toMatchObject({ ok: false });
    vi.mocked(db.refundRequest.findUnique).mockResolvedValue(pending as never);
    for (const bad of ["", "short", undefined]) expect(await decideRefundAction(approve, bad)).toMatchObject({ ok: false });
    expect(gw.issue).not.toHaveBeenCalled();
  });

  it("rejecting records the note and never touches the gateway", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: "bob" } as never);
    expect(await decideRefundAction({ id: "r1", decision: "reject" }, "Not covered by policy")).toMatchObject({ ok: true });
    expect(db.refundRequest.updateMany).toHaveBeenCalledWith({ where: { id: "r1", status: "pending" }, data: expect.objectContaining({ status: "rejected", decisionNote: "Not covered by policy" }) });
    expect(gw.issue).not.toHaveBeenCalled();
    expect(gw.resolve).not.toHaveBeenCalled();
  });

  it("rejects malformed decisions", async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: "bob" } as never);
    for (const bad of [{ id: "r1", decision: "maybe" }, { decision: "approve" }, null]) expect(await decideRefundAction(bad, REASON)).toMatchObject({ ok: false });
  });
});

describe("withdraw, retry and self-approval setting", () => {
  it("only the requester can withdraw a pending request", async () => {
    expect(await cancelRefundRequestAction("r1")).toMatchObject({ ok: true });
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: "bob" } as never);
    expect(await cancelRefundRequestAction("r1")).toMatchObject({ ok: false });
  });

  it("retrying a payment needs a reason, an open invoice, and is rate limited", async () => {
    vi.mocked(db.invoice.findUnique).mockResolvedValue({ ...invoice, status: "open" } as never);
    gw.retry.mockResolvedValue({ ok: true, message: "Stripe collected the payment" });
    expect(await retryInvoicePaymentAction("i1", "short")).toMatchObject({ ok: false });
    expect(await retryInvoicePaymentAction("i1", REASON)).toMatchObject({ ok: true });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.invoice_payment_retried", reason: REASON }));
    vi.mocked(db.invoice.findUnique).mockResolvedValue(invoice as never);
    expect(await retryInvoicePaymentAction("i1", REASON)).toMatchObject({ ok: false });
    vi.mocked(enforceRateLimit).mockRejectedValue(new RateLimitError(Date.now()));
    expect(await retryInvoicePaymentAction("i1", REASON)).toMatchObject({ ok: false, error: expect.stringMatching(/few times/) });
  });

  it("a failed retry is reported and audited as failed", async () => {
    vi.mocked(db.invoice.findUnique).mockResolvedValue({ ...invoice, status: "open" } as never);
    gw.retry.mockResolvedValue({ ok: false, error: "Your card was declined." });
    expect(await retryInvoicePaymentAction("i1", REASON)).toMatchObject({ ok: false, error: expect.stringMatching(/declined/) });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.invoice_payment_retry_failed" }));
  });

  it("the self-approval setting needs access.manage (full administrators only) and a reason", async () => {
    expect(await setRefundSelfApprovalAction(true, REASON)).toMatchObject({ ok: true });
    expect(requireAdminPermission).toHaveBeenCalledWith("access.manage");
    expect(db.systemSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ value: "true" }) }));
    expect(await setRefundSelfApprovalAction(true, "")).toMatchObject({ ok: false });
    expect(await setRefundSelfApprovalAction("yes" as never, REASON)).toMatchObject({ ok: false });
  });
});
