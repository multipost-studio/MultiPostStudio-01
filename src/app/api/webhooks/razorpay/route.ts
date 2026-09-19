import { NextResponse, type NextRequest } from "next/server";
import { env, flags } from "@/lib/env";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { applyPlan, cancelSubscription, mirrorRazorpayInvoices } from "@/lib/adapters/billing";
import { verifyRazorpayWebhook } from "@/lib/adapters/razorpay";
import { claimWebhookEvent, releaseWebhookEvent } from "@/lib/webhook-idempotency";
import type { PlanKey } from "@/lib/constants";

export const runtime = "nodejs";

/**
 * Razorpay subscription webhooks. Configure the endpoint in the Razorpay
 * dashboard (Settings → Webhooks) at {APP_URL}/api/webhooks/razorpay with the
 * events: subscription.activated, subscription.charged, subscription.resumed,
 * subscription.cancelled, subscription.completed, subscription.halted.
 */
export async function POST(req: NextRequest) {
  if (flags.billingProvider !== "razorpay" || !env.RAZORPAY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "razorpay billing not configured" }, { status: 501 });
  }

  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (!verifyRazorpayWebhook(raw, sig)) {
    logger.warn("razorpay webhook signature verification failed");
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  let event: {
    event: string;
    payload?: {
      subscription?: { entity?: RzpSubEntity };
    };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // Idempotency — Razorpay retries and allows manual replay from the dashboard.
  // NOTE: Razorpay payloads have no top-level `id` (Stripe does), so the key
  // must identify the *occurrence*, not just the subscription: keying on
  // `charged:<subId>` permanently claimed the first renewal and silently
  // dropped every later one (periodEnd never advanced, receipts never
  // mirrored — paying customers lapsed). Per-charge payment id + event
  // timestamp make each billing cycle unique while exact redeliveries still
  // dedup (same payment id + same timestamp).
  const subEntityId = event.payload?.subscription?.entity?.id;
  const evt = event as {
    created_at?: number;
    payload?: { payment?: { entity?: { id?: string } }; subscription?: { entity?: { id?: string } } };
  };
  const occurrence = evt.payload?.payment?.entity?.id ?? (evt.created_at != null ? String(evt.created_at) : null);
  const claimKey = subEntityId && occurrence ? `${event.event}:${subEntityId}:${occurrence}` : null;
  if (claimKey) {
    if (!(await claimWebhookEvent("razorpay", claimKey, event.event))) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  } else {
    logger.warn({ type: event.event }, "razorpay webhook without subscription entity — no idempotency key");
  }

  const sub = event.payload?.subscription?.entity;
  const notes = sub?.notes ?? {};
  const orgId = notes.orgId;
  const planKey = notes.planKey as PlanKey | undefined;
  const interval = (notes.interval as "month" | "year") ?? "month";

  try {
    switch (event.event) {
      case "subscription.activated":
      case "subscription.charged":
      case "subscription.resumed": {
        if (orgId && planKey) {
          await applyPlan(
            orgId,
            planKey,
            interval,
            undefined,
            {
              customerId: sub?.customer_id,
              subscriptionId: sub?.id,
              periodEnd: sub?.current_end ? new Date(sub.current_end * 1000) : undefined,
            },
            "razorpay",
          );

          // Receipts, from Razorpay's own invoices. Shared with the checkout
          // confirmation path so both produce identical records — this used to
          // be duplicated here with the period guessed as "now".
          if (sub?.id) await mirrorRazorpayInvoices(orgId, sub.id);
        }
        break;
      }
      case "subscription.cancelled":
      case "subscription.completed":
      case "subscription.halted": {
        const local = sub?.id
          ? await db.subscription.findFirst({ where: { stripeSubscriptionId: sub.id } })
          : null;
        if (local) await cancelSubscription(local.orgId);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    // Release the claim: the provider will retry, and a held claim would
    // turn that retry into a "duplicate" — silently losing a real payment,
    // cancellation, or renewal. Side effects below are replay-safe
    // (applyPlan upserts; invoice mirroring skips existing rows).
    if (claimKey) await releaseWebhookEvent("razorpay", claimKey);
    logger.error({ err: e, type: event.event }, "razorpay webhook handler error");
    return NextResponse.json({ error: "handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

type RzpSubEntity = {
  id: string;
  status: string;
  plan_id?: string;
  customer_id?: string;
  current_end?: number;
  notes?: Record<string, string>;
};
