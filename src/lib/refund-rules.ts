/**
 * Rules for refund requests. Pure.
 *
 * A refund is asked for by one person and only reaches the payment gateway after a different person approves it
 * (unless a full administrator has explicitly allowed self-approval, which is off by default). The amount can never
 * exceed what is still refundable on the invoice, counting refunds already made and requests still in flight.
 */
/** SystemSetting key: when "true", the person who asked for a refund may also approve it. Off unless a full administrator turns it on. */
export const SELF_APPROVAL_KEY = "refunds_allow_self_approval";

export const REFUND_STATUSES = ["pending", "processing", "refunded", "failed", "rejected", "canceled"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const STATUS_LABEL: Record<RefundStatus, string> = {
  pending: "Waiting for approval",
  processing: "Sending to the gateway",
  refunded: "Refunded",
  failed: "Failed at the gateway",
  rejected: "Rejected",
  canceled: "Canceled",
};

/** Statuses whose amount still counts against the invoice: money that has gone, or may be about to. */
const COUNTS: ReadonlySet<string> = new Set(["pending", "processing", "refunded"]);

export type RequestAmount = { status: string; amountMinor: number };

export function refundedOrReservedMinor(requests: readonly RequestAmount[]): number {
  return requests.filter((r) => COUNTS.has(r.status)).reduce((n, r) => n + r.amountMinor, 0);
}

/** What can still be requested on this invoice. */
export function refundableMinor(invoiceMinor: number, requests: readonly RequestAmount[]): number {
  return Math.max(0, invoiceMinor - refundedOrReservedMinor(requests));
}

export type AmountCheck = { ok: true; minor: number } | { ok: false; error: string };

/** Turn what a person typed (major units, e.g. "12.50") into minor units, within what is refundable. `exponent` is the currency's decimals. */
export function parseRefundAmount(input: unknown, refundable: number, exponent = 2): AmountCheck {
  const n = typeof input === "number" ? input : typeof input === "string" && input.trim() !== "" ? Number(input) : NaN;
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "Enter an amount above zero" };
  const minor = Math.round(n * 10 ** exponent);
  if (minor < 1) return { ok: false, error: "That amount is too small" };
  if (minor > refundable) return { ok: false, error: "That is more than can still be refunded on this invoice" };
  return { ok: true, minor };
}

export type DecisionCheck = { ok: true } | { ok: false; error: string };

/** May `approverId` decide a request that `requesterId` made? */
export function canDecide(requesterId: string | null, approverId: string, allowSelfApproval: boolean): DecisionCheck {
  if (requesterId && requesterId === approverId && !allowSelfApproval) {
    return { ok: false, error: "A refund has to be approved by someone other than the person who asked for it" };
  }
  return { ok: true };
}

/** A full refund of an invoice, for reversing the affiliate commission earned on it. */
export function isFullRefund(invoiceMinor: number, requests: readonly RequestAmount[]): boolean {
  return invoiceMinor > 0 && requests.filter((r) => r.status === "refunded").reduce((n, r) => n + r.amountMinor, 0) >= invoiceMinor;
}
