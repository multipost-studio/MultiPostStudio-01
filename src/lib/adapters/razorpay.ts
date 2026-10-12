import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Thin Razorpay client (Subscriptions API). Basic-auth with key id + secret.
 * Amounts are in the minor unit of RAZORPAY_CURRENCY (paise for INR).
 * Docs: https://razorpay.com/docs/api/payments/subscriptions/
 */

const BASE = "https://api.razorpay.com/v1";

function authHeader(): string {
  return "Basic " + Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
}

async function rzp<T>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: authHeader(), "content-type": "application/json", ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Razorpay ${method} ${path} -> ${res.status} ${text.slice(0, 400)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export type RzpSubscription = {
  id: string;
  status: string;
  short_url: string;
  plan_id: string;
  customer_id?: string;
  current_end?: number;
  /** Charges that have succeeded so far. */
  paid_count?: number;
  notes?: Record<string, string>;
};

/** Create a Razorpay plan for a (planKey, interval, amount, currency). */
export async function createRazorpayPlan(args: {
  planKey: string;
  interval: "month" | "year";
  amount: number;
  name: string;
  /** Defaults to RAZORPAY_CURRENCY (env) when not given — pass explicitly for
   * per-checkout currency choice (see adapters/billing.ts startCheckout). */
  currency?: string;
}): Promise<{ id: string }> {
  return rzp("POST", "/plans", {
    period: args.interval === "year" ? "yearly" : "monthly",
    interval: 1,
    item: {
      name: `MultiPost Studio ${args.name} (${args.interval}ly)`,
      amount: args.amount,
      currency: args.currency ?? env.RAZORPAY_CURRENCY,
    },
    notes: { planKey: args.planKey, interval: args.interval },
  });
}

export async function createRazorpaySubscription(args: {
  planId: string;
  totalCount: number;
  notes: Record<string, string>;
}): Promise<RzpSubscription> {
  return rzp("POST", "/subscriptions", {
    plan_id: args.planId,
    total_count: args.totalCount,
    customer_notify: 1,
    notes: args.notes,
  });
}

export type RzpInvoice = {
  id: string;
  status: string; // issued | paid | partially_paid | cancelled | expired
  amount: number;
  amount_paid?: number;
  currency: string;
  short_url?: string;
  billing_start?: number;
  billing_end?: number;
  paid_at?: number;
  /** The payment that settled this invoice; what a refund is issued against. */
  payment_id?: string;
};

/** Invoices Razorpay raised for a subscription — the authoritative receipts. */
export async function listRazorpayInvoices(subscriptionId: string): Promise<RzpInvoice[]> {
  const res = await rzp<{ items?: RzpInvoice[] }>(
    "GET",
    `/invoices?subscription_id=${encodeURIComponent(subscriptionId)}&count=20`,
  );
  return res.items ?? [];
}

/**
 * Refund (part of) a payment. `amount` is in the payment's minor unit. The idempotency key makes a repeated call with the
 * same key return the original refund instead of creating a second one.
 */
export async function refundRazorpayPayment(paymentId: string, amount: number, idempotencyKey: string, notes: Record<string, string> = {}): Promise<{ id: string; status?: string }> {
  return rzp("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, { amount, notes }, { "X-Refund-Idempotency": idempotencyKey });
}

/** Fetch one subscription — used to verify a checkout belongs to the caller's org. */
export async function getRazorpaySubscription(id: string): Promise<RzpSubscription> {
  return rzp("GET", `/subscriptions/${id}`);
}

export async function cancelRazorpaySubscription(id: string, atCycleEnd = true) {
  return rzp("POST", `/subscriptions/${id}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 });
}

/** Verify the X-Razorpay-Signature header on a webhook (HMAC-SHA256 hex of the raw body). */
export function verifyRazorpayWebhook(rawBody: string, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}
