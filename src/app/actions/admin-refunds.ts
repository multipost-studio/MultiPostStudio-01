"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/events";
import { requireAdminPermission } from "@/lib/session";
import { parseReason } from "@/lib/admin-reason";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications/service";
import { minorExponent, formatMoney } from "@/lib/revenue";
import { SELF_APPROVAL_KEY, canDecide, isFullRefund, parseRefundAmount, refundableMinor } from "@/lib/refund-rules";
import { issueRefund, resolvePaymentRef, retryInvoicePayment } from "@/lib/adapters/refunds";
import { reverseCommissionForInvoice } from "@/lib/affiliates";

/**
 * Refund workflow. A refund is requested by one person (refunds.request) and only sent to the payment gateway after a
 * different person approves it (refunds.approve), unless a full administrator has switched on self-approval. Every step is
 * audited, the amount can never exceed what is still refundable, and the gateway call carries the request id as its
 * idempotency key so it can never refund twice.
 */
type Result = { ok: true; message: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

async function selfApprovalAllowed(): Promise<boolean> {
  try {
    return (await db.systemSetting.findUnique({ where: { key: SELF_APPROVAL_KEY }, select: { value: true } }))?.value === "true";
  } catch {
    return false;
  }
}

const requestInput = z.object({ invoiceId: z.string().min(1).max(64), amount: z.union([z.string(), z.number()]) });

export async function requestRefundAction(raw: unknown, reasonInput: unknown): Promise<Result> {
  const admin = await requireAdminPermission("refunds.request");
  const why = parseReason(reasonInput);
  if (!why.ok) return fail(why.error);
  const p = requestInput.safeParse(raw);
  if (!p.success) return fail("Invalid request");

  const inv = await db.invoice.findUnique({ where: { id: p.data.invoiceId } });
  if (!inv) return fail("Invoice not found");
  if (inv.status !== "paid") return fail("Only a paid invoice can be refunded");
  const existing = await db.refundRequest.findMany({ where: { invoiceId: inv.id }, select: { status: true, amountMinor: true } });
  const amount = parseRefundAmount(p.data.amount, refundableMinor(inv.amountDue, existing), minorExponent(inv.currency));
  if (!amount.ok) return fail(amount.error);

  // Find the gateway payment now, so a refund that could never be sent is refused at the door, not discovered at approval.
  const resolved = await resolvePaymentRef(inv);
  if (!resolved.ok) return fail(resolved.error);

  const row = await db.refundRequest.create({
    data: { invoiceId: inv.id, orgId: inv.orgId, amountMinor: amount.minor, currency: inv.currency, reason: why.reason, requestedById: admin.id, provider: resolved.ref.provider },
    select: { id: true },
  });
  await logAudit({ orgId: inv.orgId, actorId: admin.id, action: "admin.refund_requested", targetType: "refund_request", targetId: row.id, reason: why.reason, metadata: { invoiceId: inv.id, amountMinor: amount.minor, currency: inv.currency } });
  revalidatePath("/admin/refunds");
  return { ok: true, message: `Refund of ${formatMoney(amount.minor, inv.currency)} requested. Someone else needs to approve it.` };
}

const decisionInput = z.object({ id: z.string().min(1).max(64), decision: z.enum(["approve", "reject"]) });

export async function decideRefundAction(raw: unknown, noteInput: unknown): Promise<Result> {
  const admin = await requireAdminPermission("refunds.approve");
  const p = decisionInput.safeParse(raw);
  if (!p.success) return fail("Invalid request");
  // Rejecting needs a reason; approving records one too, so the audit trail always says why.
  const note = parseReason(noteInput);
  if (!note.ok) return fail(note.error);

  const req = await db.refundRequest.findUnique({ where: { id: p.data.id } });
  if (!req || req.status !== "pending") return fail("That request isn't waiting for a decision");
  const allowed = canDecide(req.requestedById, admin.id, await selfApprovalAllowed());
  if (!allowed.ok) return fail(allowed.error);

  if (p.data.decision === "reject") {
    const res = await db.refundRequest.updateMany({ where: { id: req.id, status: "pending" }, data: { status: "rejected", decidedById: admin.id, decidedAt: new Date(), decisionNote: note.reason } });
    if (res.count === 0) return fail("Someone else already decided that request");
    await logAudit({ orgId: req.orgId, actorId: admin.id, action: "admin.refund_rejected", targetType: "refund_request", targetId: req.id, reason: note.reason, metadata: { invoiceId: req.invoiceId, amountMinor: req.amountMinor } });
    await tell(req.requestedById, "Your refund request was rejected", note.reason);
    revalidatePath("/admin/refunds");
    return { ok: true, message: "Rejected" };
  }

  const inv = await db.invoice.findUnique({ where: { id: req.invoiceId } });
  if (!inv) return fail("The invoice no longer exists");
  // Others may have been refunded since this was requested: re-check against what has actually gone or is going out.
  const others = await db.refundRequest.findMany({ where: { invoiceId: inv.id, id: { not: req.id }, status: { in: ["refunded", "processing"] } }, select: { status: true, amountMinor: true } });
  if (req.amountMinor > refundableMinor(inv.amountDue, others)) return fail("The invoice no longer has enough left to refund. Reject this request and ask for a smaller one.");

  const claim = await db.refundRequest.updateMany({ where: { id: req.id, status: "pending" }, data: { status: "processing", decidedById: admin.id, decidedAt: new Date(), decisionNote: note.reason } });
  if (claim.count === 0) return fail("Someone else already decided that request");

  const resolved = await resolvePaymentRef(inv);
  const outcome = resolved.ok
    ? await issueRefund({ ref: resolved.ref, amountMinor: req.amountMinor, currency: req.currency, idempotencyKey: `refund-${req.id}`, requestId: req.id, invoiceId: inv.id })
    : ({ ok: false, error: resolved.error } as const);

  if (!outcome.ok) {
    await db.refundRequest.update({ where: { id: req.id }, data: { status: "failed", error: outcome.error } });
    await logAudit({ orgId: req.orgId, actorId: admin.id, action: "admin.refund_failed", targetType: "refund_request", targetId: req.id, reason: note.reason, metadata: { invoiceId: inv.id, error: outcome.error } });
    await tell(req.requestedById, "A refund failed at the payment gateway", outcome.error);
    revalidatePath("/admin/refunds");
    return fail(`The gateway didn't refund it: ${outcome.error}`);
  }

  await db.refundRequest.update({ where: { id: req.id }, data: { status: "refunded", providerRefundId: outcome.providerRefundId, error: null } });
  await logAudit({ orgId: req.orgId, actorId: admin.id, action: "admin.refund_issued", targetType: "refund_request", targetId: req.id, reason: note.reason, metadata: { invoiceId: inv.id, amountMinor: req.amountMinor, currency: req.currency, providerRefundId: outcome.providerRefundId } });
  // A fully refunded invoice earns no affiliate commission. A commission already paid out is left for a deliberate adjustment.
  const all = await db.refundRequest.findMany({ where: { invoiceId: inv.id }, select: { status: true, amountMinor: true } });
  if (isFullRefund(inv.amountDue, all)) await reverseCommissionForInvoice(inv.id, "Invoice fully refunded").catch((err) => logger.warn({ err, invoiceId: inv.id }, "commission reversal after refund failed"));
  await tell(req.requestedById, "Your refund was sent", `${formatMoney(req.amountMinor, req.currency)} was refunded.`);
  revalidatePath("/admin/refunds");
  revalidatePath("/admin/billing");
  return { ok: true, message: `Refunded ${formatMoney(req.amountMinor, req.currency)}` };
}

async function tell(userId: string | null, title: string, body: string): Promise<void> {
  if (!userId) return;
  await createNotification({ userId, type: "system", title, body: body.slice(0, 280), linkUrl: "/admin/refunds", noEmail: true }).catch((err) => logger.warn({ err }, "refund notification failed"));
}

/** The requester can withdraw a request that has not been decided. */
export async function cancelRefundRequestAction(id: string): Promise<Result> {
  const admin = await requireAdminPermission("refunds.request");
  if (typeof id !== "string" || !id) return fail("Invalid request");
  const req = await db.refundRequest.findUnique({ where: { id }, select: { requestedById: true, orgId: true, invoiceId: true } });
  if (!req) return fail("Request not found");
  if (req.requestedById !== admin.id) return fail("Only the person who asked can withdraw a request");
  const res = await db.refundRequest.updateMany({ where: { id, status: "pending" }, data: { status: "canceled" } });
  if (res.count === 0) return fail("That request is no longer waiting");
  await logAudit({ orgId: req.orgId, actorId: admin.id, action: "admin.refund_canceled", targetType: "refund_request", targetId: id, metadata: { invoiceId: req.invoiceId } });
  revalidatePath("/admin/refunds");
  return { ok: true, message: "Request withdrawn" };
}

/** Ask the gateway to collect an open invoice again (Stripe only). */
export async function retryInvoicePaymentAction(invoiceId: string, reasonInput: unknown): Promise<Result> {
  const admin = await requireAdminPermission("billing.manage");
  const why = parseReason(reasonInput);
  if (!why.ok) return fail(why.error);
  if (typeof invoiceId !== "string" || !invoiceId) return fail("Invalid request");
  try {
    await enforceRateLimit(`invoice-retry:${invoiceId}`, 3, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) return fail("That invoice was retried a few times already. Try again in an hour.");
    throw e;
  }
  const inv = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return fail("Invoice not found");
  if (inv.status !== "open") return fail("Only an open (unpaid) invoice can be retried");
  const res = await retryInvoicePayment(inv);
  await logAudit({ orgId: inv.orgId, actorId: admin.id, action: res.ok ? "admin.invoice_payment_retried" : "admin.invoice_payment_retry_failed", targetType: "invoice", targetId: inv.id, reason: why.reason, metadata: res.ok ? { result: "paid" } : { error: res.error } });
  revalidatePath("/admin/billing");
  return res.ok ? { ok: true, message: res.message } : fail(res.error);
}

/** Full administrators only (access.manage is never given to a role): let a person approve their own refund request. Off by default. */
export async function setRefundSelfApprovalAction(allowed: boolean, reasonInput: unknown): Promise<Result> {
  const admin = await requireAdminPermission("access.manage");
  const why = parseReason(reasonInput);
  if (!why.ok) return fail(why.error);
  if (typeof allowed !== "boolean") return fail("Invalid request");
  await db.systemSetting.upsert({ where: { key: SELF_APPROVAL_KEY }, create: { key: SELF_APPROVAL_KEY, value: String(allowed), updatedBy: admin.id }, update: { value: String(allowed), updatedBy: admin.id } });
  await logAudit({ actorId: admin.id, action: "admin.refund_self_approval_changed", targetType: "system", targetId: SELF_APPROVAL_KEY, reason: why.reason, metadata: { allowed } });
  revalidatePath("/admin/refunds");
  return { ok: true, message: allowed ? "People can now approve their own refund requests" : "Refunds need a second person again" };
}
