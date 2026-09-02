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

async function rzp<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: authHeader(), "content-type": "application/json" },
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
  notes?: Record<string, string>;
};

/** Create a Razorpay plan for a (planKey, interval, amount). */
export async function createRazorpayPlan(args: {
  planKey: string;
  interval: "month" | "year";
  amount: number;
  name: string;
}): Promise<{ id: string }> {
  return rzp("POST", "/plans", {
    period: args.interval === "year" ? "yearly" : "monthly",
    interval: 1,
    item: {
      name: `MultiPost Studio ${args.name} (${args.interval}ly)`,
      amount: args.amount,
      currency: env.RAZORPAY_CURRENCY,
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
