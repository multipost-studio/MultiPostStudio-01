import { NextResponse, type NextRequest } from "next/server";
import { env, flags } from "@/lib/env";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { applyPlan, cancelSubscription } from "@/lib/adapters/billing";
import { verifyRazorpayWebhook } from "@/lib/adapters/razorpay";
import { claimWebhookEvent } from "@/lib/webhook-idempotency";
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
      payment?: { entity?: { id: string; amount: number; currency: string } };
    };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // Idempotency — Razorpay retries and allows manual replay from the dashboard.
  if (!(await claimWebhookEvent("razorpay", (event as { id?: string }).id, event.event))) {
    return NextResponse.json({ received: true, duplicate: true });
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

          // Mirror the paid invoice locally for the billing UI.
          const payment = event.payload?.payment?.entity;
          if (event.event === "subscription.charged" && payment) {
            const count = await db.invoice.count({ where: { orgId } });
            await db.invoice.create({
              data: {
                orgId,
                number: `MPS-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
                amountDue: payment.amount,
                currency: (payment.currency ?? env.RAZORPAY_CURRENCY).toLowerCase(),
                status: "paid",
                periodStart: new Date(),
                periodEnd: sub?.current_end ? new Date(sub.current_end * 1000) : new Date(),
              },
            });
          }
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
